angular.module('ion-google-place', [])

.directive('ionGooglePlace', [
  '$ionicTemplateLoader',
  '$ionicBackdrop',
  '$ionicPlatform',
  '$q',
  '$timeout',
  '$rootScope',
  '$document',
  function($ionicTemplateLoader, $ionicBackdrop, $ionicPlatform, $q, $timeout, $rootScope, $document) {
    return {
      require: '?ngModel',
      restrict: 'E',
      template: '<input type="text" readonly="readonly" class="ion-google-place" autocomplete="off">',
      replace: true,
      scope: {
        ngModel: '=?',
        geocodeOptions: '=',
        filteredTypes: '=',
        onSelect: '&',
        onCancel: '&'
      },
      link: function(scope, element, attrs, ngModel) {
        var unbindBackButtonAction;

        scope.locations = [];
        var geocoder = new google.maps.Geocoder();
        var addressTypes = ['street_address', 'premise', 'subpremise'];
        var streetNumberRegEx = /^\s*\d+\s*/;
        var onCancel;

        var POPUP_TPL = [
          '<div class="ion-google-place-container modal">',
          '<div class="bar bar-header item-input-inset">',
          '<label class="item-input-wrapper">',
          '<i class="icon ion-ios7-search placeholder-icon"></i>',
          '<input class="google-place-search" type="search" ng-model="searchQuery" ng-model-options="{debounce: 350}" placeholder="' + (attrs.searchPlaceholder || 'Enter an address, place or ZIP code') + '">',
          '</label>',
          '<button class="button button-clear">',
          attrs.labelCancel || 'Cancel',
          '</button>',
          '</div>',
          '<ion-content class="has-header has-header">',
          '<ion-list>',
          '<ion-item ng-repeat="location in locations" type="item-text-wrap" ng-click="selectLocation(location)">',
          '{{location.formatted_address}}',
          '</ion-item>',
          '</ion-list>',
          '</ion-content>',
          '</div>'
        ].join('');

        var popupPromise = $ionicTemplateLoader.compile({
          template: POPUP_TPL,
          scope: scope,
          appendTo: $document[0].body
        });

        popupPromise.then(function(el) {
          var searchInputElement = angular.element(el.element.find('input'));

          scope.selectLocation = function(location) {
            ngModel.$setViewValue(location);
            ngModel.$render();
            el.element.css('display', 'none');
            $ionicBackdrop.release();

            if (unbindBackButtonAction) {
              unbindBackButtonAction();
              unbindBackButtonAction = null;
            }

            removeKeyboardHideListener();

            scope.onSelect();
          };

          // this should be debounced by 350 with ng-model-options
          scope.$watch('searchQuery', function(query) {
            if (!query || query.length < 3) {
              scope.locations = [];
              return;
            }

            var req = scope.geocodeOptions || {};
            req.address = query;
            geocoder.geocode(req, function(results, status) {
              if (status == google.maps.GeocoderStatus.OK) {
                scope.$apply(function() {
                  var filteredTypes = scope.filteredTypes;

                  if (typeof filteredTypes === 'string') {
                    filteredTypes = filteredTypes.split(/\s*,\s*|\s+/);
                  }

                  if (filteredTypes && filteredTypes.length) {
                    var filteredTypesMap = {};

                    filteredTypes.forEach(function(ft) {
                      filteredTypesMap[ft] = true;
                    });

                    var parseStreetNumerForRoute = includeRouteToParseStreetNumber(filteredTypesMap);

                    scope.locations = results.filter(function(loc) {
                      return loc.types.some(function(type) {
                        if (filteredTypesMap[type]) {
                          return true;
                        } else if (parseStreetNumerForRoute && isParseStreetAddressForLocation(loc)) {
                          var streetNumberMatch = query.match(streetNumberRegEx);
                          var streetNumber = '';

                          if (streetNumberMatch && streetNumberMatch.length) {
                            streetNumber = streetNumberMatch[0].trim();
                          }

                          if (streetNumber) {
                            loc.formatted_address = [streetNumber, loc.formatted_address].join(' ');

                            loc.address_components.unshift({
                              long_name: streetNumber,
                              short_name: streetNumber,
                              types: ['street_number']
                            });

                            return true;
                          } else {
                            return false;
                          }
                        }
                      });
                    });
                  } else {
                    scope.locations = results;
                  }
                });
              } else {
                // @TODO: Figure out what to do when the geocoding fails
              }
            });
          });

          function includeRouteToParseStreetNumber(typeMap) {
            return !!(!typeMap.route && addressTypes.some(function(addrType) {
              return typeMap[addrType];
            }));
          }

          function isParseStreetAddressForLocation(loc) {
            if (loc && ~loc.types.indexOf('route')) {
              var allTypes = loc.address_components.reduce(function(allObj, comp) {
                (comp.types || []).forEach(function(t) {
                  allObj[t] = true;
                });

                return allObj;
              }, {});

              return !allTypes.street_number && [
                'route',
                'country',
                'administrative_area_level_1',
                'postal_code'
              ].every(function(t) {
                return !!allTypes[t];
              });
            } else {
              return false;
            }
          }

          var onClick = function(e) {
            e.preventDefault();
            e.stopPropagation();

            $ionicBackdrop.retain();
            unbindBackButtonAction = $ionicPlatform.registerBackButtonAction(closeOnBackButton, 250);

            el.element.css('display', 'block');
            searchInputElement[0].focus();
            setTimeout(function() {
              searchInputElement[0].focus();

              removeKeyboardHideListener();
              window.addEventListener('native.keyboardhide', onCancel);
            }, 0);
          };

          onCancel = function(e) {
            scope.searchQuery = '';
            $ionicBackdrop.release();
            el.element.css('display', 'none');

            if (unbindBackButtonAction) {
              unbindBackButtonAction();
              unbindBackButtonAction = null;
            }

            removeKeyboardHideListener();

            scope.onCancel();
          };

          closeOnBackButton = function(e) {
            e.preventDefault();

            el.element.css('display', 'none');
            $ionicBackdrop.release();

            if (unbindBackButtonAction) {
              unbindBackButtonAction();
              unbindBackButtonAction = null;
            }

            removeKeyboardHideListener();
          }

          element.bind('click', onClick);
          element.bind('touchend', onClick);

          el.element.find('button').bind('click', onCancel);
        });

        if (attrs.placeholder) {
          element.attr('placeholder', attrs.placeholder);
        }


        ngModel.$formatters.unshift(function(modelValue) {
          if (!modelValue) return '';
          return modelValue;
        });

        ngModel.$parsers.unshift(function(viewValue) {
          return viewValue;
        });

        ngModel.$render = function() {
          if (!ngModel.$viewValue) {
            element.val('');
          } else {
            element.val(ngModel.$viewValue.formatted_address || '');
          }
        };

        scope.$on("$destroy", function() {
          if (unbindBackButtonAction) {
            unbindBackButtonAction();
            unbindBackButtonAction = null;
          }

          removeKeyboardHideListener();
        });

        function removeKeyboardHideListener() {
          window.removeEventListener('native.keyboardhide', onCancel);
        }
      }
    };
  }
]);