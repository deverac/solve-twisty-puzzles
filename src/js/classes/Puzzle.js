// Puzzle class abstracts out features common to every twisty polyhedra
// 1) It has faces, which are just collections of stickers
// 2) It has cycles, which represent the twistable slices
class Puzzle {
  constructor(displayName, displaySize, faces, cycles) {
    this.displayName = displayName;
    this.displaySize = displaySize;
    this.faces = faces;
    this.cycles = cycles;

    this.twisting = this.rotating = false;
    this.startEvtCoordinates = {};
    this.baseOrientation = {
      axis: new Vector({ x: 1, y: 0, z: 0 }),
      angle: 0,
    };
    this.animationState = {
      active: false,
      counter: 0,
      // direction: undefined,
      // cycle: undefined,
      direction: null,
      cycle: null,
    };

    // While animating the cycle twists, convex face structures are temporarily broken, so we operate directly on stickers
    this.stickers = [].concat(...this.faces.map((face) => face.stickers));

    this.cycleMap = {};
    this.processCycleMap();
    this.startSticker = undefined;
    this.updatedOrientation = undefined;
  }

  // For fast lookups of cycles passing through some sticker
  processCycleMap() {
    this.cycles.forEach((cycle) =>
      cycle.stickerCollections.forEach((stickerCollection) => {
        if (stickerCollection.isPrimary) {
          stickerCollection.forEach((sticker) => {
            this.cycleMap[sticker.id] = this.cycleMap[sticker.id] || [];
            this.cycleMap[sticker.id].push(cycle);
          });
        }
      })
    );
  }

  // Update works in two modes
  // 1) When a slice twist is animated, covered stickers are rotated around cycle axis & then sorted by depth (slow)
  // 2) When the puzzle is not changing, face orientations are updated & sorted by normal vector values (fast)
  update(animatePref = false) {
    if (
      this.animationState.active &&
      this.animationState.counter <
        (animatePref ? this.animationState.cycle.animationConfig.steps : 1)
    ) {
      const alpha =
        this.animationState.direction *
        this.animationState.counter *
        this.animationState.cycle.animationConfig.dAlpha;
      const orientation = {
        axis: this.animationState.cycle.unitVector,
        angle: alpha,
      };
      this.stickers.forEach((sticker) => {
        if (this.animationState.cycle.stickerCover[sticker.id]) {
          sticker.update(orientation);
        }
      });
      this.stickers.sort((s1, s2) => s2.attractor.z - s1.attractor.z);
      this.animationState.counter++;
    } else {
      this.faces.forEach((face) =>
        face.update(this.updatedOrientation || this.baseOrientation)
      );
      this.faces.sort((f1, f2) => f2.normalVector.z - f1.normalVector.z);
      if (this.animationState.active) {
        this.animationState.cycle.twist(this.animationState.direction);
        if (this.animationState.callback) {
          this.animationState.callback();
          if (
            this.animationState.counter <
            (animatePref
              ? this.animationState.cycle.animationConfig.steps
              : 1)
          ) {
            return this.update(animatePref);
          }
        }
        this.animationState = {
          active: false,
          counter: 0,
          direction: undefined,
          cycle: undefined,
        };
      }
    }
  }

  // Finds reference to the sticker which is on top & coveres coordinates (x, y)
  findTouchedSticker(x, y) {
    let sticker;
    for (let f = this.faces.length - 1; f >= 0; f--) {
      if (this.faces[f].normalVector.z >= 0) {
        return;
      }
      sticker = this.faces[f].stickers.find((sticker) =>
        sticker.contains({ x, y, z: 0 })
//        sticker.contains({ x:x, y:y, z: 0 })
      );
      if (sticker) {
          return sticker;
      }
    }
  }

  // Grabs the puzzle for re-orienting / twisting
  grab(x, y, type) {
    this.startEvtCoordinates.x = x;
    this.startEvtCoordinates.y = y;
    if (type === 2) {
      this.rotating = true;
    } else {
      this.startSticker = this.findTouchedSticker(x, y);
      this.twisting = !!this.startSticker;
      this.rotating = !this.startSticker;
    }
  }

  // Re-orients / applies the twist
  drag(x, y, allowTwist = true, allowRotate = true) {
    if (this.animationState.active) return;
    if (this.rotating && allowRotate) {
      const dx = (x - this.startEvtCoordinates.x) / 100;
      const dy = (y - this.startEvtCoordinates.y) / 100;
      if (dx || dy) {
        // rotate the puzzle around normal vector to the cursor vector (in the plane of the screen)
        // by an angle proportional to it's magnitude
        const v = new Vector({ x: dy, y: -dx, z: 0 });
        this.updatedOrientation = {
          axis: v,
          angle: v.magnitude(),
        };
        const uo = this.updatedOrientation;
        return [uo.axis.x, uo.axis.y, uo.axis.z, uo.angle];
      }
    } else if (this.twisting && allowTwist) {
      const v = new Vector(
        new Point(this.startEvtCoordinates.x, this.startEvtCoordinates.y, 0),
        new Point(x, y, 0)
      );
      if (v.magnitude() > 20) {
        return this.detectCycle(v);
      }
    }
//    return;
  }

  // To detect the cycle to twist, We create a vector for mouse movement.
  // The cycle we want to twist passes through the clicked sticker & gives the maximum cross product with cursor vector
  detectCycle(v) {
    if (!this.cycleMap[this.startSticker.id]) return;
    let mxMg = 0;
    let mxCycle;
    let mxDirection;
    this.cycleMap[this.startSticker.id].forEach((cycle) => {
      const unitPoint = new Point(
        cycle.unitVector.x,
        cycle.unitVector.y,
        cycle.unitVector.z
      );
      unitPoint.z = 0;
      const vC = new Vector(unitPoint);
      const product = v.cross(vC);
      if (mxMg < product.magnitude()) {
        mxMg = product.magnitude();
        mxCycle = cycle;
        mxDirection = product.z > 0 ? -1 : 1;
      }
    });
// console.log('xxaction', mxCycle.index, mxDirection);
    this.animateAndTwist(mxCycle, mxDirection);
    this.release();
    return [mxCycle.index, mxDirection];
  }

  animateAndTwist(cycle, direction) {
    if (this.animationState.active) return false;
    this.animationState = {
      active: true,
      counter: 0,
      direction: direction,
      cycle: cycle,
    };
    return true;
  }

  // release the puzzle
  release() {
    this.twisting = this.rotating = false;
    this.startEvtCoordinates = {};
    if (this.updatedOrientation) {
      this.saveOrientation(this.updatedOrientation);
      this.updatedOrientation = undefined;
    }
    this.startSticker = undefined;
  }

  // Set the orientation as the new base orientation for the puzzle
  saveOrientation(orientation) {
    this.stickers.forEach((sticker) =>
      sticker.points.forEach((point) => point.saveOrientation(orientation))
    );
    this.cycles.forEach((cycle) => cycle.saveOrientation(orientation));
  }




scrumble(twists) {
    const count = twists.length;
    const animationConfigs = [];
    twists.forEach(({ cycle, direction }, index) => {
      animationConfigs.push({
        active: true,
        counter: 0,
        direction,
        cycle,
        callback:
          index < count - 1
            ? () => { this.animationState = animationConfigs[index + 1]; }
            : () => {},
      });
    });
    this.animationState = animationConfigs[0];
  }

  isAnimationActive() {
      return this.animationState.active
  }

  getFaceCount() {
      return this.faces.length;
  }

  getStickerCount() {
      return this.faces[0].stickers.length;
  }

  getCycleCount() {
      return this.cycles.length;
  }

  getCycleFamilyCount() {
        // Easier to hard-code than modify polyhedra classes.
        return {4:4, 6:3, 8:4, 12:12, 20:12}[this.getFaceCount()];
  }

  getCycle(n) {
      return this.cycles[n];
  }

  setStickerColor(face, sticker, color) {
        this.faces[face].stickers[sticker].colorData.code = color;
  }
    doPremoves(premoves) {
        if (!premoves) { premoves = []; }
        if (this.cycles.length > 0 && premoves.length > 0) {

            this.scrumble(premoves);

            // Every cycle holds a reference to the same animationConfig so
            // we only need to update the reference.

            // Save current values and recompute alphaM.
            //const aniCfg = this.cycles[0].animationConfig;
            const steps = this.cycles[0].animationConfig.steps;
            const dAlpha = this.cycles[0].animationConfig.dAlpha;
            const alphaM = steps * dAlpha;

            // Update values
            this.cycles[0].animationConfig.steps = 1;
            this.cycles[0].animationConfig.dAlphas = alphaM;

            // NOTE: Use '<=' because we must update one more time than the number of premoves.
            for (var i=0; i<=premoves.length; i++) {
                this.update(false);
            }

            // Restore previous values.
            this.cycles[0].animationConfig.steps = steps;
            this.cycles[0].animationConfig.dAlphas = dAlpha;
        }
    }


  // If animating, use depth sorted stickers to render
  // If not animating, use sorted faces to render
  render(ctx, inverted, exploded = true) {
    if (!this.animationState.active) {
      const [start, end, step] = !inverted
        ? [0, this.faces.length, 1]
        : [this.faces.length - 1, -1, -1];
      for (var i = start; i !== end; i += step) {
        this.faces[i].render(ctx, inverted, exploded);
      }
    } else {
      const [start, end, step] = !inverted
        ? [0, this.stickers.length, 1]
        : [this.stickers.length - 1, -1, -1];
      for (var i = start; i !== end; i += step) {
        this.stickers[i].render(ctx, inverted, exploded);
      }
    }
  }
}
