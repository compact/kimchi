/**
 * kimchi.flight contains the different flight modes:
 *   free: User-controlled flight.
 *   auto: Automatically guided flight.
 */

var kimchi = (function (kimchi) {
	var $ = kimchi.jQuery;

	kimchi.flight = {};
	kimchi.flight.mode = false; // possible values are 'free', 'auto', and false



	// free flight
	kimchi.flight.free = {
		'start': function () {
			kimchi.pointerLock.unbind();
			kimchi.$overlay.hide();
			$('#hud1').show();

			kimchi.clock.start();
			kimchi.flight.mode = 'free';
			kimchi.rendering.animate(kimchi.flight.free.animationFrame);
			kimchi.controls.enable();
		},
		'stop': function () {
			kimchi.controls.disable();
			kimchi.flight.mode = false;
			kimchi.clock.stop();

			$('#hud1').hide();
			kimchi.$overlay.show();

			kimchi.pointerLock.bind();
		},
		'toggle': function (enable) {
			if (enable) {
				kimchi.flight.free.start();
			} else {
				kimchi.flight.free.stop();
			}
		},
		'animationFrame': function (delta) {
			if (!kimchi.flight.free.colliding()) {
				kimchi.controls.moveCamera(
					delta,
					kimchi.flight.getTranslationSpeedMultiplier()
				);
			}

			kimchi.space.move(delta);
			kimchi.hud.update(delta);
			kimchi.date.setDate(kimchi.date.getDate() + 1);
		},
		// Return whether the camera is colliding with an object along the current
		// movement direction.
		'colliding': function () {
			var translationVector, raycaster, intersection;

			translationVector = kimchi.controls.getLocalTranslationVector();

			// scaling may be necessary if translationVector's magnitude is much larger
			// or smaller than the camera position
//		translationVector.multiplyScalar(1000);

			if (translationVector.length() === 0) { // not moving, can't be colliding
				return false;
			}

			raycaster = new THREE.Raycaster(
				kimchi.camera.position.clone(),
				// calculation based on http://stackoverflow.com/questions/11473755/how-to-detect-collision-in-three-js
				kimchi.camera.localToWorld(translationVector).sub(kimchi.camera.position),
//			kimchi.camera.position.clone().sub(translationVector.applyMatrix4(kimchi.camera.matrix)),
				0,
				kimchi.config.collisionDistance
			);
			intersection = raycaster.intersectObjects(
				kimchi.space.getCollideableObject3Ds()
			);
			return intersection.length > 0;
		}
	};



	kimchi.flight.auto = {
		'init': function () {
			$('.nav').on('click', 'a', function (event) {
				var name;

				// prevent the overlay from being clicked to trigger free flight mode
				event.stopPropagation();

				name = $(this).data('name');
				if (typeof kimchi.space.bodies[name] === 'object') {
					kimchi.flight.auto.flyTo(kimchi.space.bodies[name]);
				} else {
					console.log(name + ' not found in kimchi.flight.auto')
				}
			});
		},
		'flyTo': function (body) {
			kimchi.notice.set('Flying to ' + body.name + '...');
			kimchi.flight.auto.panTo(body);
			kimchi.flight.auto.translateTo(body);
			kimchi.notice.clear();
		},
		// requires kimchi.camera.useQuaternion = true;
		'panTo': function (body) {
			var initQuaternion, rotationMatrix, targetQuaternion, t;

			initQuaternion = kimchi.camera.quaternion.clone();

			rotationMatrix = new THREE.Matrix4();
			rotationMatrix.lookAt(
				kimchi.camera.position,
				body.mesh.position,
				kimchi.camera.up
			);

			targetQuaternion = new THREE.Quaternion();
			targetQuaternion.setFromRotationMatrix(rotationMatrix);

			t = 0;
			kimchi.flight.mode = 'auto';
			kimchi.rendering.animate(function (delta) {
				// avoid rounding imprecision because we want the final rotation to be
				// centered exactly onto the target body (t = 1)
				if (t > 1 && t < 1 + 0.05) {
					t = 1;
				}

				if (t <= 1) {
					kimchi.camera.quaternion.copy(
						initQuaternion.slerp(targetQuaternion, t)
					);
					kimchi.flight.auto.animationFrame(delta);

					t += 0.05;
				} else {
					return false;
				}
			});
		},
		'translateTo': function (body) {

		},
		'animationFrame': function (delta) {
			kimchi.space.update();
			kimchi.hud.update(delta);
		}
	};



	// Return a number for scaling the camera speed (in each direction) depending
	// on how close the camera is to collideable objects.
	kimchi.flight.getTranslationSpeedMultiplier = function () {
		var distances = [];

		$.each(kimchi.space.getCollideableObject3Ds(), function (i, object3D) {
			distances.push(kimchi.camera.position.distanceTo(object3D.position));
		});
		distances.sort(function (a, b) { // sort numerically
			return a - b;
		});
		return distances[0];
	};



	return kimchi;
}(kimchi));