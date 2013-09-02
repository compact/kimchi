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

  var flight = {}, currentMode = '', Mode;
  KIMCHI.flight = flight;


  /**
   * The available flight modes, each an instance of {@link Mode}.
   * @memberOf module:KIMCHI.flight
   */
  flight.modes = {};
  /**
   * @returns {(String|Boolean)}
   */
  flight.getMode = function () {
    return currentMode;
  };
  /**
   * @param {(String|Boolean)}
   */
  flight.setMode = function (name) {
    var prevName = currentMode;

    if (prevName === name) {
      // the given mode is already the current mode; do nothing
      return;
    }

    console.log('change flight mode from ' + prevName + ' to ' + name);
    if (typeof flight.modes[prevName] === 'object') {
      // on the first call to setMode(), there is no previous mode
      flight.modes[prevName].disable();
    }
    flight.modes[name].enable();
    currentMode = name;
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
/*    KIMCHI.$overlay.blurjs({
      source: '#space',
      radius: 7,
      overlay: 'rgba(255,255,255,0.4)'
    });*/
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

    KIMCHI.rendering.animate(function (delta) {
      if (!self.enabled) {
        // this mode is being disabled
        console.log('stop animate() for ' + self.name);
        return false;
      }

      return self.animationFrame(delta);
    });
  };



  /**
   * Free flight.
   */
  flight.modes.free = (function () {
    var mode, colliding;

    /**
     * @returns {Boolean} Whether the camera is current in collision, i.e.
     *   within any Body's collision distance.
     * @private
     */
    colliding = (function () {
      var translationVector, raycaster, intersects, returnValue;

      raycaster = new THREE.Raycaster();

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
        _.forEach(intersects, function (intersect) {
          // TODO take into account the object's Body's radius
          var body = KIMCHI.space.getBody(intersect.object.name);
          if (intersect.distance < body.getCollisionDistance()) {
console.log('Collision with ' + body.name + ': ' + intersect.distance + ' < ' + body.getCollisionDistance());
            returnValue = true;
            return false; // break the loop
          }
        });
        return returnValue;
      };
    }());

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
      if (!colliding()) {
        KIMCHI.controls.moveCamera(
          delta,
          flight.getTranslationSpeedMultiplier()
        );
      }

      KIMCHI.space.moveBodies(delta);
      KIMCHI.ui.hud.update(delta);
      KIMCHI.date.setDate(KIMCHI.date.getDate() + 1);
    };

    return mode;
  }());



  /**
   * Auto flight.
   */
  flight.modes.auto = (function () {
    var mode, keydown, animationFrame, panTo, translateTo;

    /**
     * The event handler for pressing Escape to stop auto flight and return to
     *   menu mode.
     * @private
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

    animationFrame = function (delta) {
      KIMCHI.space.moveBodyChildren(); // do not move the Body Meshes themselves
      KIMCHI.ui.hud.update(delta);
    };

    /**
     * Pan (rotate) the camera towards the given Body (without translating).
     *   Return false to disable auto flight.
     * @returns {(undefined|false)}
     * @private
     */
    panTo = (function () {
      var initQuaternion, rotationMatrix, targetQuaternion, t;

      rotationMatrix = new THREE.Matrix4();
      targetQuaternion = new THREE.Quaternion();

      return function (body) {
        initQuaternion = KIMCHI.camera.quaternion.clone();

        rotationMatrix.lookAt(
          KIMCHI.camera.position,
          body.mesh.position,
          KIMCHI.camera.up
        );

        targetQuaternion.setFromRotationMatrix(rotationMatrix);

        t = 0;
        mode.animationFrame = function (delta) {
          // avoid rounding imprecision because we want the final rotation to be
          // centered exactly onto the target body (t = 1)
          if (t > 1 && t < 1 + 0.05) {
            t = 1;
          }

          if (t <= 1) {
            KIMCHI.camera.quaternion.copy(
              initQuaternion.slerp(targetQuaternion, t)
            );
            animationFrame(delta);

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
     */
    translateTo = function (body) {
      mode.animationFrame = function (delta) {
        if (THREE.Object3D.distance(KIMCHI.camera, body.mesh) - body.radius >=
            body.getCollisionDistance()) {
          KIMCHI.camera.translateZ(-KIMCHI.config.controls.zSpeed * delta *
            flight.getTranslationSpeedMultiplier([body]));
          animationFrame(delta);
        } else {
          flight.setMode('menu');
          return false;
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
     * @public
     */
    mode.flyTo = function (body) {
      KIMCHI.ui.notice.set(KIMCHI.config.notices.flyTo(body));
      panTo(body);
      // TODO make function queue for successive setTimeout() calls
    };

    return mode;
  }());



  flight.modes.menu = (function () {
    var mode, keydown;

    /**
     * The event handler for pressing Escape to request pointer lock. We request
     *   pointer lock only on keyup; otherwise, the continued Escape keydown
     *   event causes the pointer lock to disable immediately, even if one lets
     *   go of the Escape key asap. Also, the flag keydownInProgress prevents
     *   multiple handlers of .one('keyup') from being binded.
     * @private
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



  return KIMCHI;
}(KIMCHI || {}, _, jQuery, THREE));