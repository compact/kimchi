/**
 * The different flight modes:
 * <br> free: User-controlled flight.
 * <br> auto: Automatically guided flight.
 * <br> menu: Flight is paused and the menu is shown.
 * @namespace flight
 * @memberOf  module:KIMCHI
 */
var KIMCHI = (function (KIMCHI, _, $, THREE) {
  'use strict';

  var flight = {}, currentMode, Mode;
  KIMCHI.flight = flight;



  /**
   * The current flight mode.
   * @private
   * @memberOf module:KIMCHI.flight
   */
  currentMode = '';

  /**
   * The available flight modes, each an instance of {@link Mode}.
   * @namespace modes
   * @memberOf  module:KIMCHI.flight
   */
  flight.modes = {};
  /**
   * @returns  {String|Boolean}
   * @memberOf module:KIMCHI.flight
   */
  flight.getMode = function () {
    return currentMode;
  };
  /**
   * @param    {String|Boolean}
   * @memberOf module:KIMCHI.flight
   */
  flight.setMode = function (name) {
    var prevName = currentMode;

    if (prevName === name) {
      // the given mode is already the current mode; do nothing
      return;
    }

    if (typeof flight.modes[prevName] === 'object') {
      // on the first call to setMode(), there is no previous mode
      flight.modes[prevName].disable();
    }
    flight.modes[name].enable();
    currentMode = name;

    console.log('flight mode changed from ' + prevName + ' to ' + name);
  };

  /**
   * Return a number for scaling the camera translation speed (in every
   *   direction) depending on how close the camera is to the closest of the
   *   given collideable Bodies; if not given, consider all collideable Bodies.
   * @param    {Array}  Bodies
   * @returns  {Number}
   * @memberOf module:KIMCHI.flight
   */
  flight.getTranslationSpeedMultiplier = function (bodies) {
    if (typeof bodies === 'undefined') {
      bodies = KIMCHI.space.getCollideableBodies();
    }

    return KIMCHI.space.getClosestDistance(bodies);
  };

  /**
   * @returns  {THREE.Vector3} The current translation speed of the camera.
   * @memberOf module:KIMCHI.flight
   */
  flight.getSpeed = function () {
    return flight.modes[currentMode].speed;
  };



  /**
   * Flight mode. Can be constructed only inside kimchi.flight.js.
   * @param       {String} name
   * @constructor Mode
   */
  Mode = function (name) {
    this.name = name;
  };
  /**
   * Whether this mode is currently enabled.
   * @memberOf Mode
   */
  Mode.prototype.enabled = false;
  /**
   * Enable.
   * @memberOf Mode
   */
  Mode.prototype.enable = function () {
    this.enabled = true;
    this.animate();
  };
  /**
   * Disable.
   * @memberOf Mode
   */
  Mode.prototype.disable = function () {
    this.enabled = false;
  };
  /**
   * Toggle.
   * @memberOf Mode
   */
  Mode.prototype.toggle = function (enable) {
    if (typeof enable === 'boolean') {
      if (enable) {
        this.enable();
      } else {
        this.disable();
      }
    } else if (this.enabled) {
      this.enable();
    } else {
      this.disable();
    }
  };
  /**
   * In this mode, what happens in each animation frame?
   * @param    {Number} delta
   * @memberOf Mode
   */
  Mode.prototype.animationFrame = function () {};
  /**
   * Start animating for this mode with this.animationFrame(). This function
   *   should only be called once, when this mode is enabled. The animation
   *   stops if either this mode is disabled or this.animationFrame() returns
   *   false.
   * @memberOf Mode
   */
  Mode.prototype.animate = function () {
    var self = this;
    KIMCHI.renderer.animate(function (delta) {
      if (!self.enabled) {
        // this mode is being disabled
        console.log('stop animating for ' + self.name + ' flight mode');
        return false;
      }

      return self.animationFrame(delta);
    });
  };
  /**
   * The current speed.
   * @memberOf Mode
   */
  Mode.prototype.speed = 0;



  /**
   * Free flight.
   * @namespace free
   * @memberOf  module:KIMCHI.flight.modes
   */
  flight.modes.free = (function () {
    var mode, colliding, getSpeed;

    /**
     * @returns  {Boolean} Whether the camera is current in collision, i.e.
     *   within any Body's collision distance.
     * @private
     * @memberOf module:KIMCHI.flight.modes.free
     */
    colliding = (function () {
      var translationVector, raycaster, intersects, returnValue;

      raycaster = new THREE.Raycaster();
      // the default precision, 0.0001, is not low enough for our 1x scale
      raycaster.precision = 0.000001;

      return function () {
        translationVector = KIMCHI.controls.getLocalTranslationVector();

        // scaling may be necessary if translationVector's magnitude is much
        // larger or smaller than the camera position
//      translationVector.multiplyScalar(1000);

        if (translationVector.length() === 0) { // not moving, can't be colliding
          return false;
        }

        raycaster.set(
          KIMCHI.camera.position.clone(),
          // calculation based on http://stackoverflow.com/questions/11473755/how-to-detect-collision-in-three-js
          KIMCHI.camera.localToWorld(translationVector)
            .sub(KIMCHI.camera.position)
//        KIMCHI.camera.position.clone().sub(translationVector.applyMatrix4(KIMCHI.camera.matrix)),
        );

        intersects = raycaster.intersectObjects(
          KIMCHI.space.getCollideableObject3Ds()
        );

        // no objects are in the current direction of translation, so not
        // colliding
        if (intersects.length === 0) {
          return false;
        }

        returnValue = false;
        _.each(intersects, function (intersect) {
          // TODO take into account the object's Body's radius
          var body = KIMCHI.space.getBody(intersect.object.name);
          if (intersect.distance < body.getCollisionDistance()) {
            returnValue = true;
            return false; // break the loop
          }
        });
        return returnValue;
      };
    }());

    /**
     * @returns  {Number} The current speed.
     * @private
     * @memberOf module:KIMCHI.flight.modes.free
     */
    getSpeed = function (delta) {
      var translation = KIMCHI.controls.getLocalTranslationVector();
      return (new THREE.Vector3(
          translation.x * KIMCHI.config.get('controls-strafe-speed'),
          translation.y * KIMCHI.config.get('controls-strafe-speed'),
          translation.z * KIMCHI.config.get('controls-z-speed')
        )).length() * KIMCHI.flight.getTranslationSpeedMultiplier() / delta;
    };

    mode = new Mode('free');
    mode.enable = function () {
      Mode.prototype.enable.call(this);

      $('#hud1').show();
      KIMCHI.controls.enable();
    };
    mode.disable = function () {
      Mode.prototype.disable.call(this);

      KIMCHI.controls.disable();
      $('#hud1').hide();
    };
    mode.animationFrame = function (delta) {
      // move the Camera
      if (!colliding()) {
        KIMCHI.controls.moveCamera(
          delta,
          flight.getTranslationSpeedMultiplier()
        );
        this.speed = getSpeed(delta);
      }

      // move the Bodies and increment the current time
      if (KIMCHI.config.get('time-on')) {
        KIMCHI.time.increment().done(function () {
          KIMCHI.space.translateBodies(delta);
        });
      }

      // rotate the Bodies
      if (KIMCHI.config.get('rotate-bodies')) {
        KIMCHI.space.rotateBodies(delta);
      }

      // move the Bodies' children
      KIMCHI.space.moveBodyChildren(delta);

      // update hud
      KIMCHI.ui.hud.update(delta);
    };

    return mode;
  }());



  /**
   * Auto flight.
   * @namespace auto
   * @memberOf  module:KIMCHI.flight.modes
   */
  flight.modes.auto = (function () {
    var mode, keydown, update, panTo, translateTo;

    /**
     * The event handler for pressing Escape to stop auto flight and return to
     *   menu mode.
     * @private
     * @memberOf module:KIMCHI.flight.modes.auto
     */
    keydown = (function () {
      var keydownInProgress = false;

      return function (event) {
        if (event.which === 27) { // Esc
          keydownInProgress = true;
          $(this).one('keyup', function (event) {
            if (event.which === 27 && keydownInProgress) {
              flight.setMode('menu');
              keydownInProgress = false;
            }
          });
        }
      };
    }());

    /**
     * Helper function called in every animationFrame() to update the space
     *   and the hud.
     * @param    {Number} delta
     * @private
     * @memberOf module:KIMCHI.flight.modes.auto
     */
    update = function (delta) {
      // do not move the Body Meshes themselves
      KIMCHI.space.moveBodyChildren();

      // update hud
      KIMCHI.ui.hud.update(delta);
    };

    /**
     * Pan (rotate) the camera towards the given Body (without translating).
     *   Return false to disable auto flight.
     * @returns  {undefined|false}
     * @private
     * @memberOf module:KIMCHI.flight.modes.auto
     */
    panTo = (function () {
      var initialQuaternion, rotationMatrix, targetQuaternion, t;

      rotationMatrix = new THREE.Matrix4();
      targetQuaternion = new THREE.Quaternion();

      return function (body) {
        initialQuaternion = KIMCHI.camera.quaternion.clone();

        rotationMatrix.lookAt(
          KIMCHI.camera.position,
          body.mesh.position,
          KIMCHI.camera.up
        );

        targetQuaternion.setFromRotationMatrix(rotationMatrix);

        t = 0;
        mode.animationFrame = function (delta) {
          // avoid rounding imprecision because we want the final rotation to be
          // centered exactly onto the target body (t = 1); the t += 0.05
          // calculations can be imprecise
          if (t > 1 && t < 1 + 0.05) {
            t = 1;
          }

          if (t <= 1) {
            KIMCHI.camera.quaternion.copy(
              initialQuaternion.clone().slerp(targetQuaternion, t)
            );
            update(delta);

            t += 0.05;
          } else {
            translateTo(body);
            //return false; // disable
          }
        };
      };
    }());

    /**
     * Translate the camera to the given Body until within range of collision.
     * @private
     * @memberOf module:KIMCHI.flight.modes.auto
     */
    translateTo = function (body) {
      mode.animationFrame = function (delta) {
        var translationZ;

        if (body.isColliding(KIMCHI.camera)) {
          flight.setMode('menu');
          // KIMCHI.pointerLock.request();
          return false;
        } else {
          translationZ = KIMCHI.config.get('controls-z-speed') * delta *
            flight.getTranslationSpeedMultiplier([body]);
          this.speed = translationZ / delta;
          KIMCHI.camera.translateZ(-translationZ);
          update(delta);
        }
      };
    };

    mode = new Mode('auto');
    mode.enable = function () {
      Mode.prototype.enable.call(this);

      KIMCHI.$document.on('keydown', keydown);
    };
    mode.disable = function () {
      Mode.prototype.disable.call(this);

      KIMCHI.ui.notice.clear(); // TODO move this
      KIMCHI.$document.off('keydown', keydown);
    };

    /**
     * Fly to the given Body. Two private functions are used sequentially to
     *   first pan and then translate to it. translateTo(body) is called when
     *   panTo(body) ends. disable() is called when translateTo(body) ends
     * @alias    flyTo
     * @memberOf module:KIMCHI.flight.modes.auto
     */
    mode.flyTo = function (body) {
      KIMCHI.ui.notice.set(KIMCHI.config.get('notices-fly-to')(body));
      KIMCHI.config.set('time-on', false);
      panTo(body);
      // TODO make function queue for successive setTimeout() calls
    };

    return mode;
  }());



  /**
   * @namespace menu
   * @memberOf  module:KIMCHI.flight.modes
   */
  flight.modes.menu = (function () {
    var mode, keydown;

    /**
     * The event handler for pressing Escape to request pointer lock. We request
     *   pointer lock only on keyup; otherwise, the continued Escape keydown
     *   event causes the pointer lock to disable immediately, even if one lets
     *   go of the Escape key asap. Also, the flag keydownInProgress prevents
     *   multiple handlers of .one('keyup') from being binded.
     * @private
     * @memberOf module:KIMCHI.flight.modes.menu
     */
    keydown = (function () {
      var keydownInProgress = false;

      return function (event) {
        if (event.which === 27) { // Esc
          keydownInProgress = true;
          $(this).one('keyup', function (event) {
            if (event.which === 27 && keydownInProgress) {
              KIMCHI.pointerLock.request();
              keydownInProgress = false;
            }
          });
        }
      };
    }());

    mode = new Mode('menu');
    mode.enable = function () {
      Mode.prototype.enable.call(this);

      KIMCHI.clock.stop();
      KIMCHI.ui.panel.update();
      KIMCHI.$overlay.show();
/*      KIMCHI.$overlay.blurjs({
        source: '#space',
        radius: 7,
        overlay: 'rgba(255,255,255,0.4)'
      });*/
      KIMCHI.$document.on('keydown', keydown);
    };
    mode.disable = function () {
      Mode.prototype.disable.call(this);

      KIMCHI.$overlay.hide();
      KIMCHI.clock.start();
      KIMCHI.$document.off('keydown', keydown);
    };
    mode.animationFrame = function () {
      return false;
    };

    return mode;
  }());



  return KIMCHI;
}(KIMCHI || {}, _, jQuery, THREE));