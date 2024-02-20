const twedra = (() => {
class Util {

    static mod(n, m) { return ((n % m) + m) % m }


    static isString(obj) { return (typeof obj === 'string' || obj instanceof String); }
    static isDefined(obj) { return (typeof obj !== 'undefined') }

    // ??? Dollar doesn't work.
    static removeComments(str) { return str.replace(/\/\/.*/g, ''); }

    static removeNewlines(str) { return str.replace(/\n+/g, ' '); }

    // Prevent the Closure compiler from warning about WRONG_ARGUMENT_COUNT.
    static parseInt(val) { return parseInt(val, 10); }

    //static toSingleLine(str) => removeNewlines(removeComments(str)).trim();
}

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

// A point is just a location in 3D space which (optionally) contains an id
// Every point object represents an orientation of a base location which is updated as puzzle is twisted or re-oriented
class Point {

/**
 @param {number} x
 @param {number} y
 @param {number} z
 @param {string} [id]
 */
  constructor(x, y, z, id) {
    this.base = { x, y, z };
    this.x = x;
    this.y = y;
    this.z = z;
    this.id = id;
  }

  // Updates the point by re-orienting it according to the given axis & angle
  update(orientation) {
    const { x, y, z } = this.rotateAroundAxis(
      this.base,
      orientation.axis.unit(),
      orientation.angle
    );
    this.x = x;
    this.y = y;
    this.z = z;
  }

  // Set the orientation as the new base orientation for the point
  saveOrientation(orientation) {
    this.update(orientation);
    this.base.x = this.x;
    this.base.y = this.y;
    this.base.z = this.z;
  }

  clone() {
    return new Point(this.x, this.y, this.z, this.id);
  }

  // rotate given point about an arbitrary axis, given unit vector in the direction of the axis & angle 'alpha'
  // references: https://eater.net/quaternions https://en.wikipedia.org/wiki/Quaternions_and_spatial_rotation
  rotateAroundAxis(point, unitVector, alpha) {
    const cA = Math.cos(alpha / 2);
    const sA = Math.sin(alpha / 2);
    const qA = new Quaternion(
      cA,
      sA * unitVector.x,
      sA * unitVector.y,
      sA * unitVector.z
    );
    const qP = new Quaternion(0, point.x, point.y, point.z);
    const qR = qA.multiply(qP).multiply(qA.conjugate());
    return new Point(qR.x, qR.y, qR.z);
  }
}

// A face is Just a collection of stickers.
// Every sticker in the face has a normal vector defined by the point order (which is expected to follow the right hand thumb rule)
// The normal vector of the face is just the normal vector of any of it's stickers.
class Face {
  constructor(stickers) {
    this.stickers = stickers;
    this.normalVector = this.stickers[0].calculateNormalVector();
  }

  update(orientation) {
    this.stickers.forEach((sticker) => sticker.update(orientation));
    this.normalVector = this.stickers[0].calculateNormalVector();
  }

  render(ctx, inverted, exploded) {
    this.stickers.forEach((sticker) => sticker.render(ctx, inverted, exploded));
  }
}

// Class representing twistable slices
// A single cycle contains multiple sticker collections.
// Each of them is a sub-cycle. By convention, the first of these sub-cycles
// is the main slice. Other sub-cycles can be used to rotate attached face.
// The period is the numbe of operations after which the twist operation
// reverts the puzzle to it's original state. A cycle also contains unit vector
// normal to it's plane & a set of sticker ids afftected by it for quick lookup.
class Cycle {
  constructor(index, stickerCollections, period, unitVector, animationConfig) {
    this.index = index;
    this.stickerCollections = stickerCollections;
    this.period = period;
    this.unitVector = unitVector;
    this.animationConfig = animationConfig;
    this.stickerCover = {};
  }

  computeStickerCover() {
    this.stickerCollections.forEach((collection) =>
      collection.forEach(({ id }) => (this.stickerCover[id] = true))
    );
  }

  saveOrientation(orientation) {
    const p = new Point(
      this.unitVector.x,
      this.unitVector.y,
      this.unitVector.z
    );
    p.update(orientation);
    this.unitVector = new Vector(p);
  }

  twist(direction = 1) {
    this.stickerCollections.forEach((collection) => {
      if (collection.length === 1) return;
      const increment = (direction * collection.length) / this.period;
      collection.forEach((sticker, index) => {
        sticker.$newColorData =
          //collection[window.mod(index - increment, collection.length)].colorData;
          collection[Util.mod(index - increment, collection.length)].colorData;
      });
      collection.forEach((sticker) => {
        sticker.colorData = sticker.$newColorData;
        delete sticker.$newColorData;
      });
    });
  }
}

// A sticker is a collection of points. It's a polygon with a fill color
// A sticker has a normal vector that points outside the puzzle. This is implied by point order & right hand thumb rule
// Not that this is the only component of the Puzzle object which is actually rendered on the canvas
class ColorData {
  constructor(code, originalStickerId) {
    this.code = code;
    this.originalStickerId = originalStickerId;
  }
}

class Sticker {
  constructor(id, colorCode, points) {
    this.id = id;
    this.colorData = new ColorData(colorCode, this.id);
    this.points = points;
    this.attractor = {};
  }

  // To check if a sticker contains a point, we circle around the points
  // returns true if during the whole traversal the point was in one direction of the current vector (either left or right)
  // returns false otherwise
  // The left/right state can be check by performing a cross product of the current edge vector & the vector from current edge start to parameter point
  contains(p) {
    let u = this.points[this.points.length - 1];
    let zProduct = 0;
    let product;
    for (const v of this.points) {
      product = new Vector(u, v).cross(new Vector(u, p));
      if ((zProduct < 0 && product.z > 0) || (zProduct > 0 && product.z < 0)) {
        return false;
      } else if (product.z !== 0) {
        zProduct = product.z;
      }
      u = v;
    }
    return true;
  }

  // Normal vector implied by point order
  calculateNormalVector() {
    return new Vector(this.points[0], this.points[1]).cross(
      new Vector(this.points[0], this.points[this.points.length - 1])
    );
  }

  // Update all the points according to params & calcuclate attractor
  // Attractor is just the sum of all point vectors. This is used for "exploding" the stickers
  update(orientation) {
    this.points.forEach((point) => point.update(orientation));
    this.attractor = {
      x: this.points.reduce((a, p) => a + p.x, 0),
      y: this.points.reduce((a, p) => a + p.y, 0),
      z: this.points.reduce((a, p) => a + p.z, 0),
    };
  }

  // Simple paralled projection (ignore the z-coordinates)
  // Also, if sticker is exploded, move it's points a little bit close to the attractor before projecting
  getPointProjection(point, inverted, exploded) {
    const result = [point.x, point.y];
    if (exploded) {
      // If in some puzzle some stickers have more points than others, The magnitude of their attractor will be larger.
      // To normalize the outward-pull, we divide the result by points.length
      result[0] += (this.attractor.x - result[0]) / (10 * this.points.length); // xAttracted = xOriginal + (xAttractor - xOriginal) / (constant * points.length)
      result[1] += (this.attractor.y - result[1]) / (10 * this.points.length); // yAttracted = yOriginal + (yAttractor - yOriginal) / (constant * points.length)
    }
    if (inverted) result[0] = -result[0]; // Used for rear-view
    return result;
  }

  // Use canvas moveTo & lineTo for drawing projected sticker
  render(ctx, inverted, exploded) {
    ctx.fillStyle = this.colorData.code;
    ctx.strokeStyle = "#202020";
    ctx.beginPath();
    ctx.moveTo(...this.getPointProjection(this.points[0], inverted, exploded));
    this.points.forEach((p) =>
      ctx.lineTo(...this.getPointProjection(p, inverted, exploded))
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

// Useful Quaternion operations (reference: https://www.youtube.com/watch?v=d4EgbgTm0Bg)
// Quaternions are 4D extensions to complex numbers used to represent 3D rotations in the application
// Although there are other ways to implement rotations based on straight forward 3D geometry, Quaternions provide an elegant approach for the same

const qDimensions = ["w", "x", "y", "z"];
const qProductSign = [
  [1, 1, 1, 1],
  [1, -1, 1, -1],
  [1, -1, -1, 1],
  [1, 1, -1, -1],
];
const qProductAxis = [
  [0, 1, 2, 3],
  [1, 0, 3, 2],
  [2, 3, 0, 1],
  [3, 2, 1, 0],
];

class Quaternion {
  constructor(w, x, y, z) {
    this.w = w;
    this.x = x;
    this.y = y;
    this.z = z;

  }

  conjugate() {
    return new Quaternion(this.w, -this.x, -this.y, -this.z);
  }

  multiply(q) {
    const product = new Quaternion(0, 0, 0, 0);
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) {
        product[qDimensions[qProductAxis[x][y]]] +=
          qProductSign[x][y] * this[qDimensions[x]] * q[qDimensions[y]];
      }
    }
    return product;
  }
}

const origin = { x: 0, y: 0, z: 0 };

// Useful Vector operations
class Vector {
  // Creates vector from point 'p' to point 'q'
  // If 'q' is not provided, Vector from origin to point 'p' is created instead
/**
 @param {Object} [p]
 @param {Object} [q]
 */
  constructor(p, q) {
    if (!q) {
      q = p;
      p = origin;
    }
    this.x = q.x - p.x;
    this.y = q.y - p.y;
    this.z = q.z - p.z;
  }

  // Vector addition
  add(v) {
    return new Vector(origin, {
      x: this.x + v.x,
      y: this.y + v.y,
      z: this.z + v.z,
    });
  }

  // Vector subtraction
  subtract(v) {
    return this.add({ x: -v.x, y: -v.y, z: -v.z });
  }

  // Multiplication by a scalar
  multiply(s) {
    return new Vector(origin, {
      x: this.x * s,
      y: this.y * s,
      z: this.z * s,
    });
  }

  // Calculate vector length
  magnitude() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  // Unit vector in direction of current vector
  unit() {
    return this.multiply(1 / this.magnitude());
  }

  // Cross product with another vector
  cross(v) {
    return new Vector(origin, {
      x: this.y * v.z - this.z * v.y,
      y: this.z * v.x - this.x * v.z,
      z: this.x * v.y - this.y * v.x,
    });
  }
}

class Cube extends Puzzle {
/**
 @param {number} [size]
 @param {number} [fullSpan]
 @param {number} [animationSteps]
 @param {Array} [colors]
 */
  constructor(size = 2, fullSpan = 250, animationSteps = 10, colors) {
    const width = fullSpan / size;
    const span = fullSpan / 2;
    const alphaM = Math.PI / 2;
    const animationConfig = {
      steps: animationSteps,
      dAlpha: alphaM / animationSteps,
    };
    if (!colors) {colors = [];}
    //if (colors.length==0) {colors=["yellow","white","blue","lawngreen","red","darkorange"];}
    if (colors.length==0) {colors=["darkorange","red","white","yellow","lawngreen","blue"];}
    const grid = {};
    const faces = [];
    const faceConfig = [
      { fixed: "x", direction: -1, variable: ["y", "z"], color: colors[0 % colors.length] },
      { fixed: "x", direction: 1, variable: ["y", "z"], color: colors[1 % colors.length] },
      { fixed: "y", direction: -1, variable: ["z", "x"], color: colors[2 % colors.length] },
      { fixed: "y", direction: 1, variable: ["z", "x"], color: colors[3 % colors.length] },
      { fixed: "z", direction: -1, variable: ["x", "y"], color: colors[4 % colors.length] },
      { fixed: "z", direction: 1, variable: ["x", "y"], color: colors[5 % colors.length] },
    ];
    const cycleFamilyConfig = [
      {
        slices: [
          { fIndex: 1, sIndex: 0, sJump: size, cJump: 1 },
          { fIndex: 3, sIndex: size - 1, sJump: -1, cJump: size },
          { fIndex: 0, sIndex: (size - 1) * size, sJump: -size, cJump: 1 },
          { fIndex: 2, sIndex: 0, sJump: 1, cJump: size },
        ],
//        attachedFaces: { ffIndex: 4, lfIndex: 5, iStep: size, jStep: 1 },
        attachedFaces: { ffIndex: 4, lfIndex: 5, "iStep": size, "jStep": 1 },
        unitVector: new Vector(new Point(0, 0, 1)),
      },
      {
        slices: [
          { fIndex: 1, sIndex: 0, sJump: 1, cJump: size },
          { fIndex: 5, sIndex: (size - 1) * size, sJump: -size, cJump: 1 },
          { fIndex: 0, sIndex: size - 1, sJump: -1, cJump: size },
          { fIndex: 4, sIndex: 0, sJump: size, cJump: 1 },
        ],
//        attachedFaces: { ffIndex: 2, lfIndex: 3, iStep: 1, jStep: size },
        attachedFaces: { ffIndex: 2, lfIndex: 3, "iStep": 1, "jStep": size },
        unitVector: new Vector(new Point(0, -1, 0)),
      },
      {
        slices: [
          { fIndex: 2, sIndex: 0, sJump: size, cJump: 1 },
          { fIndex: 5, sIndex: 0, sJump: 1, cJump: size },
          { fIndex: 3, sIndex: (size - 1) * size, sJump: -size, cJump: 1 },
          { fIndex: 4, sIndex: size - 1, sJump: -1, cJump: size },
        ],
//        attachedFaces: { ffIndex: 0, lfIndex: 1, iStep: 1, jStep: size },
        attachedFaces: { ffIndex: 0, lfIndex: 1, "iStep": 1, "jStep": size },
        unitVector: new Vector(new Point(-1, 0, 0)),
      },
    ];
    const fSliceConfig = [
      { key: "iStep", dir: 1 },
      { key: "jStep", dir: 1 },
      { key: "iStep", dir: -1 },
      { key: "jStep", dir: -1 },
    ];

    let v1;
    let v2;
    let pointDef;
    let pid;
    let sid;
    let spoints;
    faceConfig.forEach((config, f) => {
      const stickers = [];
      v1 = -span;
      for (let i = 0; i <= size; i++) {
        v2 = -span;
        for (let j = 0; j <= size; j++) {
          pid = `p-${f}-${i}-${j}`;
//          pointDef = {};
          pointDef = {x:0, y:0, z:0};
          pointDef[config.fixed] = config.direction * span;
          pointDef[config.variable[0]] = v1;
          pointDef[config.variable[1]] = v2;
          grid[pid] = new Point(pointDef.x, pointDef.y, pointDef.z, pid);
          if (i && j) {
            sid = `s-${f}-${i}-${j}`;
            spoints = [
              grid[`p-${f}-${i}-${j}`].clone(),
              grid[`p-${f}-${i - 1}-${j}`].clone(),
              grid[`p-${f}-${i - 1}-${j - 1}`].clone(),
              grid[`p-${f}-${i}-${j - 1}`].clone(),
            ];
            if (config.direction === -1) {
              spoints.reverse();
            }
            stickers.push(new Sticker(sid, config.color, spoints));
          }
          v2 += width;
        }
        v1 += width;
      }
      faces.push(new Face(stickers));
    });

    const cycles = [];
    let cycle;
    let stickerCollection;
    let stickerIndex;
    let fCycle;
    let lCycle;
    let fFace;
    let lFace;
    cycleFamilyConfig.forEach((config) => {
      for (let c = 0; c < size; c++) {
        cycle = new Cycle(
          cycles.length,
          [],
          4,
          config.unitVector,
          animationConfig
        );
        stickerCollection = [];
        config.slices.forEach((slice) => {
          for (let s = 0; s < size; s++) {
            stickerIndex = slice.sIndex + s * slice.sJump + c * slice.cJump;
            stickerCollection.push(faces[slice.fIndex].stickers[stickerIndex]);
          }
        });
        cycle.stickerCollections.push(stickerCollection);
        cycles.push(cycle);
      }
      fCycle = cycles[cycles.length - size];
      fFace = faces[config.attachedFaces.ffIndex];

      for (let c = 0; c < Math.floor(size / 2); c++) {
        stickerCollection = [];
        stickerIndex = c * (size + 1);
        fSliceConfig.forEach(({ key, dir }) => {
          for (let s = 0; s < size - 2 * c - 1; s++) {
            stickerCollection.push(fFace.stickers[stickerIndex]);
            stickerIndex += config.attachedFaces[key] * dir;
          }
        });
        fCycle.stickerCollections.push(stickerCollection);
      }
      lCycle = cycles[cycles.length - 1];
      lFace = faces[config.attachedFaces.lfIndex];
      for (let c = 0; c < Math.floor(size / 2); c++) {
        stickerCollection = [];
        stickerIndex = c * (size + 1);
        fSliceConfig.forEach(({ key, dir }) => {
          for (let s = 0; s < size - 2 * c - 1; s++) {
            stickerCollection.push(lFace.stickers[stickerIndex]);
            stickerIndex += config.attachedFaces[key] * dir;
          }
        });
        lCycle.stickerCollections.push(stickerCollection);
      }
      if (size % 2) {
        fCycle.stickerCollections.push([fFace.stickers[(size * size - 1) / 2]]);
        lCycle.stickerCollections.push([lFace.stickers[(size * size - 1) / 2]]);
      }
    });
    cycles.forEach((cycle) => {
      cycle.stickerCollections[0].isPrimary = true;
      cycle.computeStickerCover();
    });
    super("Cube", size, faces, cycles);

    this.saveOrientation({
      axis: new Vector({ x: 0, y: 1, z: 0 }),
      angle: Math.PI / 4,
    });
    this.saveOrientation({
      axis: new Vector({ x: 1, y: 0, z: 0 }),
      angle: Math.PI / 8,
    });

  }
}

class Icosahedron extends Puzzle {
/**
 @param {number} [size]
 @param {number} [fullSpan]
 @param {number} [animationSteps]
 @param {Array} [colors]
 */
  constructor(size = 2, fullSpan = 200, animationSteps = 10, colors) {
    const grid = {};
    const stickerMap = {};
    const faces = [];
    const cycles = [];
    const alphaM = (2 * Math.PI) / 5;
    const animationConfig = {
      steps: animationSteps,
      dAlpha: alphaM / animationSteps,
    };
    if (!colors) {colors = [];}
    if (colors.length==0) {colors=["white","blue","red","lawngreen","skyblue","orange","darkolivegreen","yellow","lightgreen","salmon","magenta","crimson","indigo","brown","darkblue","pink","burlywood","darkcyan","darkmagenta","goldenrod"];}
    const scaledUnit = fullSpan / 2;
    const scaledPhi = (scaledUnit * (1 + Math.sqrt(5))) / 2;
    const rootPoints = [
      new Point(0, scaledPhi, scaledUnit, "r0"),
      new Point(0, scaledPhi, -scaledUnit, "r1"),
      new Point(0, -scaledPhi, scaledUnit, "r2"),
      new Point(0, -scaledPhi, -scaledUnit, "r3"),

      new Point(scaledPhi, scaledUnit, 0, "r4"),
      new Point(scaledPhi, -scaledUnit, 0, "r5"),
      new Point(-scaledPhi, scaledUnit, 0, "r6"),
      new Point(-scaledPhi, -scaledUnit, 0, "r7"),

      new Point(scaledUnit, 0, scaledPhi, "r8"),
      new Point(-scaledUnit, 0, scaledPhi, "r9"),
      new Point(scaledUnit, 0, -scaledPhi, "r10"),
      new Point(-scaledUnit, 0, -scaledPhi, "r11"),
    ];
    const faceConfig = [
      { points: [rootPoints[0], rootPoints[4], rootPoints[1]], color:  colors[0 % colors.length]},
      { points: [rootPoints[0], rootPoints[1], rootPoints[6]], color:  colors[1 % colors.length]},
      { points: [rootPoints[0], rootPoints[6], rootPoints[9]], color:  colors[2 % colors.length]},
      {
        points: [rootPoints[0], rootPoints[9], rootPoints[8]],
        color: colors[3 % colors.length],
      },
      {
        points: [rootPoints[0], rootPoints[8], rootPoints[4]],
        color: colors[4 % colors.length],
      },

      {
        points: [rootPoints[3], rootPoints[2], rootPoints[7]],
        color: colors[5 % colors.length],
      },
      {
        points: [rootPoints[3], rootPoints[5], rootPoints[2]],
        color: colors[6 % colors.length],
      },
      {
        points: [rootPoints[3], rootPoints[10], rootPoints[5]],
        color: colors[7 % colors.length],
      },
      {
        points: [rootPoints[3], rootPoints[11], rootPoints[10]],
        color: colors[8 % colors.length],
      },
      {
        points: [rootPoints[3], rootPoints[7], rootPoints[11]],
        color: colors[9 % colors.length],
      },

      {
        points: [rootPoints[4], rootPoints[5], rootPoints[10]],
        color: colors[10 % colors.length],
      },
      {
        points: [rootPoints[1], rootPoints[10], rootPoints[11]],
        color: colors[11 % colors.length],
      },
      {
        points: [rootPoints[6], rootPoints[11], rootPoints[7]],
        color: colors[12 % colors.length],
      },
      { points: [rootPoints[9], rootPoints[7], rootPoints[2]], color: colors[13 % colors.length]},
      {
        points: [rootPoints[8], rootPoints[2], rootPoints[5]],
        color: colors[14 % colors.length],
      },

      { points: [rootPoints[2], rootPoints[8], rootPoints[9]], color:  colors[15 % colors.length]},
      {
        points: [rootPoints[5], rootPoints[4], rootPoints[8]],
        color: colors[16 % colors.length],
      },
      {
        points: [rootPoints[10], rootPoints[1], rootPoints[4]],
        color: colors[17 % colors.length],
      },
      {
        points: [rootPoints[11], rootPoints[6], rootPoints[1]],
        color: colors[18 % colors.length],
      },
      {
        points: [rootPoints[7], rootPoints[9], rootPoints[6]],
        color: colors[19 % colors.length],
      },
    ];
    faceConfig.forEach((f, i) => (f.id = i));
    const faceSliceConfig = {};
    const cycleFamilyConfig = [];
    rootPoints.forEach((point) => {
      const rootID = point.id;
      const config = { root: point, faces: [] };
      const pointChain = [];
      let face = faceConfig.find(({ points }) =>
        points.find((p) => p.id === rootID)
      );
      config.faces.push(face);
      pointChain.push(
        face.points[Util.mod(face.points.findIndex((p) => p.id === rootID) + 2, 3)]
          .id
      );
      for (let c = 0; c < 4; c++) {
        const p0id = rootID;
        const p1id =
          face.points[Util.mod(face.points.findIndex((p) => p.id === rootID) + 1, 3)]
            .id;
        const p2id =
          face.points[Util.mod(face.points.findIndex((p) => p.id === rootID) + 2, 3)]
            .id;
        face = faceConfig.find(
          ({ points }) =>
            !points.find((p) => p.id === p1id) &&
            points.find((p) => p.id === p0id) &&
            points.find((p) => p.id === p2id)
        );
        config.faces.push(face);
      }
      cycleFamilyConfig.push(config);
    });
    faceConfig.forEach(({ points, color }, f) => {
      const stickers = [];
      const baseVector = new Vector(points[0]);
      const vI = new Vector(points[0], points[1]).multiply(1 / size);
      const vJ = new Vector(points[1], points[2]).multiply(1 / size);
      let pointVector;
      let i;
      let j;
      for (i = 0; i <= size; i++) {
        for (j = 0; j <= i; j++) {
          pointVector = baseVector.add(vI.multiply(i)).add(vJ.multiply(j));
          grid[`p-${f}-${i}-${j}`] = new Point(
            pointVector.x,
            pointVector.y,
            pointVector.z
          );
          if (i && j) {
            stickers.push(
              new Sticker(`s-${f}-${i}-${j}`, color, [
                grid[`p-${f}-${i - 1}-${j - 1}`].clone(),
                grid[`p-${f}-${i}-${j - 1}`].clone(),
                grid[`p-${f}-${i}-${j}`].clone(),
              ])
            );
            stickerMap[stickers[stickers.length - 1].id] =
              stickers[stickers.length - 1];
            if (j < i) {
              stickers.push(
                new Sticker(`s-${f}-${i}-${j}-r`, color, [
                  grid[`p-${f}-${i}-${j}`].clone(),
                  grid[`p-${f}-${i - 1}-${j}`].clone(),
                  grid[`p-${f}-${i - 1}-${j - 1}`].clone(),
                ])
              );
              stickerMap[stickers[stickers.length - 1].id] =
                stickers[stickers.length - 1];
            }
          }
        }
      }
      faces.push(new Face(stickers));

      const sliceConfig = {};
      sliceConfig[points[0].id] = [];
      for (let i = 1; i <= size; i++) {
        const slice = [];
        for (let j = 1; j <= i; j++) {
          slice.push(stickerMap[`s-${f}-${i}-${j}`]);
          if (j < i) {
            slice.push(stickerMap[`s-${f}-${i}-${j}-r`]);
          }
        }
        sliceConfig[points[0].id].push(slice);
      }
      sliceConfig[points[1].id] = [];
      for (let i = 1; i <= size; i++) {
        const slice = [];
        for (let j = 1; j <= i; j++) {
          slice.push(stickerMap[`s-${f}-${size - (j - 1)}-${i - (j - 1)}`]);
          if (j < i) {
            slice.push(stickerMap[`s-${f}-${size - (j - 1)}-${i - j}-r`]);
          }
        }
        sliceConfig[points[1].id].push(slice);
      }
      sliceConfig[points[2].id] = [];
      for (let i = 1; i <= size; i++) {
        const slice = [];
        for (let j = 1; j <= i; j++) {
          slice.push(
            stickerMap[`s-${f}-${size + (j - 1) - (i - 1)}-${size - (i - 1)}`]
          );
          if (j < i) {
            slice.push(
              stickerMap[
                `s-${f}-${size + 1 + (j - 1) - (i - 1)}-${size - (i - 1)}-r`
              ]
            );
          }
        }
        sliceConfig[points[2].id].push(slice);
      }
      faceSliceConfig[f] = sliceConfig;
    });

    cycleFamilyConfig.forEach(({ faces, root }) => {
      for (let c = 0; c < size; c++) {
        const unitVector = new Vector(root).unit();
        const stickerCollections = [
          Array.prototype.concat.apply(
            [],
            faces.map(({ id }) => faceSliceConfig[id][root.id][c])
          ),
        ];
        cycles.push(
          new Cycle(
            cycles.length,
            stickerCollections,
            5,
            unitVector,
            animationConfig
          )
        );
      }
    });
    cycles.forEach((cycle) => {
      cycle.stickerCollections[0].isPrimary = true;
      cycle.computeStickerCover();
    });
    super("Icosahedron", size, faces, cycles);

    this.saveOrientation({
      axis: new Vector({ x: 1, y: 0, z: 0 }),
      angle: (-27 * Math.PI) / 40,
    });
  }
}

class Octahedron extends Puzzle {
/**
 @param {number} [size]
 @param {number} [fullSpan]
 @param {number} [animationSteps]
 @param {Array} [colors]
 */
  constructor(size = 2, fullSpan = 200, animationSteps = 10, colors) {
    const alphaM = (2 * Math.PI) / 3;
    const animationConfig = {
      steps: animationSteps,
      dAlpha: alphaM / animationSteps,
    };
    if (!colors) {colors = [];}
    if (colors.length==0) {colors=["white","blue","lawngreen","skyblue","red","darkorange","purple","yellow"];}
    const grid = {};
    const stickerMap = {};
    const faces = [];
    const cycles = [];
    const rootPoints = [
      new Point(0, 0, -fullSpan),
      new Point(fullSpan, 0, 0),
      new Point(0, fullSpan, 0),
      new Point(-fullSpan, 0, 0),
      new Point(0, -fullSpan, 0),
      new Point(0, 0, fullSpan),
    ];
    const faceConfig = [
      { points: [rootPoints[0], rootPoints[2], rootPoints[1]], color: colors[0 % colors.length] },
      { points: [rootPoints[0], rootPoints[1], rootPoints[4]], color: colors[1 % colors.length] },
      {
        points: [rootPoints[0], rootPoints[4], rootPoints[3]],
        color: colors[2 % colors.length],
      },
      {
        points: [rootPoints[0], rootPoints[3], rootPoints[2]],
        color: colors[3 % colors.length],
      },
      { points: [rootPoints[5], rootPoints[1], rootPoints[2]], color: colors[4 % colors.length] },
      {
        points: [rootPoints[5], rootPoints[2], rootPoints[3]],
        color: colors[5 % colors.length],
      },
      {
        points: [rootPoints[5], rootPoints[3], rootPoints[4]],
        color: colors[6 % colors.length],
      },
      {
        points: [rootPoints[5], rootPoints[4], rootPoints[1]],
        color: colors[7 % colors.length],
      },
    ];
    const cycleFamilyConfig = [
      {
        slices: [
          {
            fIndex: 4,
            sIJ: (row) => [size - row - 1, 2 * (size - row - 1)],
            dIJ: () => [0, -1],
            limJ: (row) => 1 + 2 * (size - row - 1),
          },
          {
            fIndex: 7,
            sIJ: (row) => [size - row - 1, 2 * (size - row - 1)],
            dIJ: (_row, col) => [col % 2 ? 0 : 1, col % 2 ? -1 : 1],
            limJ: (row) => 1 + 2 * row,
          },
          {
            fIndex: 1,
            sIJ: (row) => [size - 1, 2 * row],
            dIJ: (_row, col) => [col % 2 ? -1 : 0, col % 2 ? -1 : 1],
            limJ: (row) => 1 + 2 * (size - row - 1),
          },
          {
            fIndex: 2,
            sIJ: (row) => [row, 0],
            dIJ: () => [0, 1],
            limJ: (row) => 1 + 2 * row,
          },
          {
            fIndex: 3,
            sIJ: (row) => [row, 0],
            dIJ: (_row, col) => [col % 2 ? 0 : 1, 1],
            limJ: (row) => 1 + 2 * (size - row - 1),
          },
          {
            fIndex: 5,
            sIJ: (row) => [size - 1, 2 * row],
            dIJ: (_row, col) => [col % 2 ? -1 : 0, -1],
            limJ: (row) => 1 + 2 * row,
          },
        ],
        attachedFaces: [
          { fIndex: 0, steps: [() => [1, 0], () => [0, 2], () => [-1, -2]] },
          { fIndex: 6, steps: [() => [1, 2], () => [0, -2], () => [-1, 0]] },
        ],
        unitVector: new Vector(new Point(1, 1, -1)).unit(),
      },
      {
        slices: [
          {
            fIndex: 0,
            sIJ: (row) => [row, 0],
            dIJ: (_row, col) => [col % 2 ? 0 : 1, 1],
            limJ: (row) => 1 + 2 * (size - row - 1),
          },
          {
            fIndex: 4,
            sIJ: (row) => [size - 1, 2 * row],
            dIJ: (_row, col) => [col % 2 ? -1 : 0, -1],
            limJ: (row) => 1 + 2 * row,
          },
          {
            fIndex: 7,
            sIJ: (row) => [size - row - 1, 2 * (size - row - 1)],
            dIJ: () => [0, -1],
            limJ: (row) => 1 + 2 * (size - row - 1),
          },
          {
            fIndex: 6,
            sIJ: (row) => [size - row - 1, 2 * (size - row - 1)],
            dIJ: (_row, col) => [col % 2 ? 0 : 1, col % 2 ? -1 : 1],
            limJ: (row) => 1 + 2 * row,
          },
          {
            fIndex: 2,
            sIJ: (row) => [size - 1, 2 * row],
            dIJ: (_row, col) => [col % 2 ? -1 : 0, col % 2 ? -1 : 1],
            limJ: (row) => 1 + 2 * (size - row - 1),
          },
          {
            fIndex: 3,
            sIJ: (row) => [row, 0],
            dIJ: () => [0, 1],
            limJ: (row) => 1 + 2 * row,
          },
        ],
        attachedFaces: [
          { fIndex: 1, steps: [() => [1, 0], () => [0, 2], () => [-1, -2]] },
          { fIndex: 5, steps: [() => [1, 2], () => [0, -2], () => [-1, 0]] },
        ],
        unitVector: new Vector(new Point(1, -1, -1)).unit(),
      },
      {
        slices: [
          {
            fIndex: 1,
            sIJ: (row) => [row, 0],
            dIJ: (_row, col) => [col % 2 ? 0 : 1, 1],
            limJ: (row) => 1 + 2 * (size - row - 1),
          },
          {
            fIndex: 7,
            sIJ: (row) => [size - 1, 2 * row],
            dIJ: (_row, col) => [col % 2 ? -1 : 0, -1],
            limJ: (row) => 1 + 2 * row,
          },
          {
            fIndex: 6,
            sIJ: (row) => [size - row - 1, 2 * (size - row - 1)],
            dIJ: () => [0, -1],
            limJ: (row) => 1 + 2 * (size - row - 1),
          },
          {
            fIndex: 5,
            sIJ: (row) => [size - row - 1, 2 * (size - row - 1)],
            dIJ: (_row, col) => [col % 2 ? 0 : 1, col % 2 ? -1 : 1],
            limJ: (row) => 1 + 2 * row,
          },
          {
            fIndex: 3,
            sIJ: (row) => [size - 1, 2 * row],
            dIJ: (_row, col) => [col % 2 ? -1 : 0, col % 2 ? -1 : 1],
            limJ: (row) => 1 + 2 * (size - row - 1),
          },
          {
            fIndex: 0,
            sIJ: (row) => [row, 0],
            dIJ: () => [0, 1],
            limJ: (row) => 1 + 2 * row,
          },
        ],
        attachedFaces: [
          { fIndex: 2, steps: [() => [1, 0], () => [0, 2], () => [-1, -2]] },
          { fIndex: 4, steps: [() => [1, 2], () => [0, -2], () => [-1, 0]] },
        ],
        unitVector: new Vector(new Point(-1, -1, -1)).unit(),
      },
      {
        slices: [
          {
            fIndex: 2,
            sIJ: (row) => [row, 0],
            dIJ: (_row, col) => [col % 2 ? 0 : 1, 1],
            limJ: (row) => 1 + 2 * (size - row - 1),
          },
          {
            fIndex: 6,
            sIJ: (row) => [size - 1, 2 * row],
            dIJ: (_row, col) => [col % 2 ? -1 : 0, -1],
            limJ: (row) => 1 + 2 * row,
          },
          {
            fIndex: 5,
            sIJ: (row) => [size - row - 1, 2 * (size - row - 1)],
            dIJ: () => [0, -1],
            limJ: (row) => 1 + 2 * (size - row - 1),
          },
          {
            fIndex: 4,
            sIJ: (row) => [size - row - 1, 2 * (size - row - 1)],
            dIJ: (_row, col) => [col % 2 ? 0 : 1, col % 2 ? -1 : 1],
            limJ: (row) => 1 + 2 * row,
          },
          {
            fIndex: 0,
            sIJ: (row) => [size - 1, 2 * row],
            dIJ: (_row, col) => [col % 2 ? -1 : 0, col % 2 ? -1 : 1],
            limJ: (row) => 1 + 2 * (size - row - 1),
          },
          {
            fIndex: 1,
            sIJ: (row) => [row, 0],
            dIJ: () => [0, 1],
            limJ: (row) => 1 + 2 * row,
          },
        ],
        attachedFaces: [
          { fIndex: 3, steps: [() => [1, 0], () => [0, 2], () => [-1, -2]] },
          { fIndex: 7, steps: [() => [1, 2], () => [0, -2], () => [-1, 0]] },
        ],
        unitVector: new Vector(new Point(-1, 1, -1)).unit(),
      },
    ];

    faceConfig.forEach((config, f) => {
      const stickers = [];
      let preArr = [config.points[0].clone()];
      let nxtArr;
      let p;
      let q;
      let r;
      let s;
      const vI = new Vector(config.points[0], config.points[1]).multiply(
        1 / size
      );
      const vJ = new Vector(config.points[1], config.points[2]).multiply(
        1 / size
      );
      let vC;
      for (let i = 0; i < size; i++) {
        nxtArr = [];
        vC = vI.add(preArr[0]);
        nxtArr.push(new Point(vC.x, vC.y, vC.z));
        for (let j = 0; j <= i; j++) {
          vC = vJ.add(vC);
          nxtArr.push(new Point(vC.x, vC.y, vC.z));
        }
        preArr.forEach((point, j) => {
          p = point.clone();
          q = nxtArr[j].clone();
          r = nxtArr[j + 1].clone();
          p.id = `p-${f}-${i}-${j}`;
          q.id = `p-${f}-${i + 1}-${j}`;
          r.id = `p-${f}-${i + 1}-${j + 1}`;
          grid[p.id] = p.clone();
          grid[q.id] = q.clone();
          grid[r.id] = r.clone();
          stickers.push(
            new Sticker(`s-${f}-${i}-${2 * j}`, config.color, [p, q, r])
          );
          stickerMap[stickers[stickers.length - 1].id] =
            stickers[stickers.length - 1];
          if (j < preArr.length - 1) {
            p = p.clone();
            r = r.clone();
            s = preArr[j + 1].clone();
            s.id = `q-${f}-${i}-${j + 1}`;
            grid[p.id] = p.clone();
            grid[r.id] = r.clone();
            grid[s.id] = s.clone();
            stickers.push(
              new Sticker(`s-${f}-${i}-${2 * j + 1}`, config.color, [p, r, s])
            );
            stickerMap[stickers[stickers.length - 1].id] =
              stickers[stickers.length - 1];
          }
        });
        preArr = nxtArr;
      }
      faces.push(new Face(stickers));
    });
    let cycle;
    let aFace;
    let stickerCollection;
    let sI;
    let sJ;
    let dI;
    let dJ;
    let lJ;
    cycleFamilyConfig.forEach((config) => {
      for (let c = 0; c < size; c++) {
        cycle = new Cycle(
          cycles.length,
          [],
          3,
          config.unitVector,
          animationConfig
        );
        stickerCollection = [];
        config.slices.forEach((slice) => {
          [sI, sJ] = slice.sIJ(c);
          lJ = slice.limJ(c);
          for (let s = 0; s < lJ; s++) {
            [dI, dJ] = slice.dIJ(c, s);
            stickerCollection.push(stickerMap[`s-${slice.fIndex}-${sI}-${sJ}`]);
            sI += dI;
            sJ += dJ;
          }
        });
        cycle.stickerCollections.push(stickerCollection);
        cycles.push(cycle);
      }
      config.attachedFaces.forEach((faceCycleConfig, fci) => {
        cycle = fci ? cycles[cycles.length - 1] : cycles[cycles.length - size];
        aFace = faceCycleConfig.fIndex;
        let l = size - 1;
        let d = 1;
        let s = 0;
        let t;
        let i;
        let j;
        while (l > 0) {
          i = j = s;
          stickerCollection = [];
          faceCycleConfig.steps.forEach((stepConfigGetter) => {
            t = 0;
            for (let x = 0; x < l; x++) {
              const [stepI, stepJ] = stepConfigGetter(s, t);
              stickerCollection.push(stickerMap[`s-${aFace}-${i}-${j}`]);
              i += stepI;
              j += stepJ;
              t += 1;
            }
          });
          cycle.stickerCollections.push(stickerCollection);
          s += 1;
          l -= d;
          d = d === 2 ? 1 : 2;
        }
        if (stickerMap[`s-${aFace}-${s}-${s}`]) {
          cycle.stickerCollections.push([stickerMap[`s-${aFace}-${s}-${s}`]]);
        }
      });
    });
    cycles.forEach((cycle) => {
      cycle.stickerCollections[0].isPrimary = true;
      cycle.computeStickerCover();
    });
    super("Octahedron", size, faces, cycles);

    this.saveOrientation({
      axis: new Vector({ x: 0, y: 1, z: 0 }),
      angle: Math.PI / 12,
    });
    this.saveOrientation({
      axis: new Vector({ x: 1, y: 0, z: 0 }),
      angle: Math.PI / 24,
    });
  }
}

class Dodecahedron extends Puzzle {
/**
 @param {number} [size]
 @param {number} [width]
 @param {number} [animationSteps]
 @param {Array} [colors]
 */
  constructor(size = 1, width = 200, animationSteps = 10, colors) {
    const phi = (1 + Math.sqrt(5)) / 2;
    const scale = width / 2;
    const scaledPhi = scale * phi;
    const scaledPhiInverse = (scale * 1) / phi;
    const faces = [];
    const cycles = [];
    const grid = {};
    const stickerMap = {};
    const alphaM = (2 * Math.PI) / 5;
    const animationConfig = {
      steps: animationSteps,
      dAlpha: alphaM / animationSteps,
    };
    if (!colors) {colors=[];}
    if (colors.length == 0) { colors=["purple","magenta","white","yellow","pink","blue","green","crimson","red","lawngreen","brown","skyblue"];}
    const rootPoints = [
      new Point(scale, scale, scale, "r0"),
      new Point(scale, scale, -scale, "r1"),
      new Point(scale, -scale, scale, "r2"),
      new Point(scale, -scale, -scale, "r3"),
      new Point(-scale, scale, scale, "r4"),
      new Point(-scale, scale, -scale, "r5"),
      new Point(-scale, -scale, scale, "r6"),
      new Point(-scale, -scale, -scale, "r7"),

      new Point(scaledPhi, scaledPhiInverse, 0, "r8"),
      new Point(scaledPhi, -scaledPhiInverse, 0, "r9"),
      new Point(-scaledPhi, scaledPhiInverse, 0, "r10"),
      new Point(-scaledPhi, -scaledPhiInverse, 0, "r11"),

      new Point(0, scaledPhi, scaledPhiInverse, "r12"),
      new Point(0, scaledPhi, -scaledPhiInverse, "r13"),
      new Point(0, -scaledPhi, scaledPhiInverse, "r14"),
      new Point(0, -scaledPhi, -scaledPhiInverse, "r15"),

      new Point(scaledPhiInverse, 0, scaledPhi, "r16"),
      new Point(scaledPhiInverse, 0, -scaledPhi, "r17"),
      new Point(-scaledPhiInverse, 0, scaledPhi, "r18"),
      new Point(-scaledPhiInverse, 0, -scaledPhi, "r19"),
    ];
    const faceConfig = [
      {
        points: [
          rootPoints[8],
          rootPoints[1],
          rootPoints[13],
          rootPoints[12],
          rootPoints[0],
        ],
        color: colors[0 % colors.length],
      },
      {
        points: [
          rootPoints[9],
          rootPoints[2],
          rootPoints[14],
          rootPoints[15],
          rootPoints[3],
        ],
        color: colors[1 % colors.length],
      },
      {
        points: [
          rootPoints[10],
          rootPoints[4],
          rootPoints[12],
          rootPoints[13],
          rootPoints[5],
        ],
        color: colors[2 % colors.length],
      },
      {
        points: [
          rootPoints[11],
          rootPoints[7],
          rootPoints[15],
          rootPoints[14],
          rootPoints[6],
        ],
        color: colors[3 % colors.length],
      },
      {
        points: [
          rootPoints[12],
          rootPoints[4],
          rootPoints[18],
          rootPoints[16],
          rootPoints[0],
        ],
        color: colors[4 % colors.length],
      },
      {
        points: [
          rootPoints[13],
          rootPoints[1],
          rootPoints[17],
          rootPoints[19],
          rootPoints[5],
        ],
        color: colors[5 % colors.length],
      },
      {
        points: [
          rootPoints[14],
          rootPoints[2],
          rootPoints[16],
          rootPoints[18],
          rootPoints[6],
        ],
        color: colors[6 % colors.length],
      },
      {
        points: [
          rootPoints[15],
          rootPoints[7],
          rootPoints[19],
          rootPoints[17],
          rootPoints[3],
        ],
        color: colors[7 % colors.length],
      },
      {
        points: [
          rootPoints[16],
          rootPoints[2],
          rootPoints[9],
          rootPoints[8],
          rootPoints[0],
        ],
        color: colors[8 % colors.length],
      },
      {
        points: [
          rootPoints[17],
          rootPoints[1],
          rootPoints[8],
          rootPoints[9],
          rootPoints[3],
        ],
        color: colors[9 % colors.length],
      },
      {
        points: [
          rootPoints[18],
          rootPoints[4],
          rootPoints[10],
          rootPoints[11],
          rootPoints[6],
        ],
        color: colors[10 % colors.length],
      },
      {
        points: [
          rootPoints[19],
          rootPoints[7],
          rootPoints[11],
          rootPoints[10],
          rootPoints[5],
        ],
        color: colors[11 % colors.length],
      },
    ];
    const getCycleVector = (attachedFace) =>
      faceConfig[attachedFace].points.reduce(
        (v, p) => v.add(p),
        new Vector({ x: 0, y: 0, z: 0 })
      );
    const cycleFamilyConfig = [];
    for (let c = 0; c < 12; c++) {
      const cycleConfig = {
        unitVector: getCycleVector(c),
        slices: { length: 5 },
      };
      let face;
      let startV;
      let endV;
      for (face = 0; face < 12; face++) {
        if (face != c) {
          for (let u = 0; u < 5; u++) {
            for (let v = 0; v < 5; v++) {
              if (
                faceConfig[c].points[u].id === faceConfig[face].points[v].id &&
                faceConfig[c].points[Util.mod(u + 1, 5)].id ===
                  faceConfig[face].points[Util.mod(v - 1, 5)].id
              ) {
                startV = v;
                endV = Util.mod(v - 1, 5);
                cycleConfig.slices[u] = { face, startV, endV };
              }
            }
          }
        }
      }
      cycleConfig.slices = Array.prototype.slice.apply(cycleConfig.slices);
      cycleFamilyConfig.push(cycleConfig);
    }
    faceConfig.forEach((config, f) => {
      const stickers = [];
      config.points.forEach((refPoint, p) => {
        const baseVector = new Vector(refPoint);
        const vI = new Vector(
          refPoint,
          config.points[Util.mod(p + 1, config.points.length)]
        ).multiply(1 / (2 * size));
        const vJ = new Vector(
          refPoint,
          config.points[Util.mod(p - 1, config.points.length)]
        ).multiply(1 / (2 * size));
        let pointVector;
        let i;
        let j;
        for (i = 0; i <= size; i++) {
          for (j = 0; j <= size; j++) {
            pointVector = baseVector.add(vI.multiply(i)).add(vJ.multiply(j));
            grid[`p-${f}-${p}-${i}-${j}`] = new Point(
              pointVector.x,
              pointVector.y,
              pointVector.z
            );
            if (i && j) {
              stickers.push(
                new Sticker(`s-${f}-${p}-${i - 1}-${j - 1}`, config.color, [
                  grid[`p-${f}-${p}-${i}-${j}`].clone(),
                  grid[`p-${f}-${p}-${i - 1}-${j}`].clone(),
                  grid[`p-${f}-${p}-${i - 1}-${j - 1}`].clone(),
                  grid[`p-${f}-${p}-${i}-${j - 1}`].clone(),
                ])
              );
              stickerMap[stickers[stickers.length - 1].id] =
                stickers[stickers.length - 1];
            }
          }
        }
        const vl = new Vector(
          config.points[Util.mod(p, config.points.length)],
          config.points[Util.mod(p - 1, config.points.length)]
        ).multiply(1 / (2 * size));
        const vr = new Vector(
          config.points[Util.mod(p + 1, config.points.length)],
          config.points[Util.mod(p + 2, config.points.length)]
        ).multiply(1 / (2 * size));
        const midVector = baseVector.add(vI.multiply(size));
        let lVector;
        let rVector;
        for (i = 0; i <= size; i++) {
          lVector = midVector.add(vl.multiply(i));
          rVector = midVector.add(vr.multiply(i));
          grid[`p-m-${f}-${p}-${i}-l`] = new Point(
            lVector.x,
            lVector.y,
            lVector.z
          );
          grid[`p-m-${f}-${p}-${i}-r`] = new Point(
            rVector.x,
            rVector.y,
            rVector.z
          );
          if (i) {
            stickers.push(
              new Sticker(`s-${f}-${p}-${i - 1}-${size}`, config.color, [
                grid[`p-m-${f}-${p}-${i}-l`].clone(),
                grid[`p-m-${f}-${p}-${i}-r`].clone(),
                grid[`p-m-${f}-${p}-${i - 1}-r`].clone(),
                grid[`p-m-${f}-${p}-${i - 1}-l`].clone(),
              ])
            );
            stickerMap[stickers[stickers.length - 1].id] =
              stickers[stickers.length - 1];
          }
        }
        const cVector = baseVector
          .add(vI.multiply(size))
          .add(vJ.multiply(size));
        grid[`p-${f}-${p}`] = new Point(cVector.x, cVector.y, cVector.z);
      });
      stickers.push(
        new Sticker(`s-${f}`, config.color, [
          grid[`p-${f}-0`].clone(),
          grid[`p-${f}-1`].clone(),
          grid[`p-${f}-2`].clone(),
          grid[`p-${f}-3`].clone(),
          grid[`p-${f}-4`].clone(),
        ])
      );
      stickerMap[stickers[stickers.length - 1].id] =
        stickers[stickers.length - 1];
      faces.push(new Face(stickers));
    });
    cycleFamilyConfig.forEach((config, attachedFace) => {
      let firstCycle;
      for (let i = 0; i < size; i++) {
        const cycle = new Cycle(
          cycles.length,
          [],
          5,
          config.unitVector,
          animationConfig
        );
        for (let j = 0; j < size; j++) {
          const stickerCollection = [];
          config.slices.forEach((slice) => {
            stickerCollection.push(
              stickerMap[`s-${slice.face}-${slice.startV}-${i}-${j}`]
            );
            stickerCollection.push(
              stickerMap[`s-${slice.face}-${slice.endV}-${j}-${i}`]
            );
          });
          cycle.stickerCollections.push(stickerCollection);
        }
        const stickerCollection = [];
        config.slices.forEach((slice) => {
          stickerCollection.push(
            stickerMap[`s-${slice.face}-${slice.endV}-${i}-${size}`]
          );
        });
        cycle.stickerCollections.push(stickerCollection);
        cycle.stickerCollections.forEach(
          (stickerCollection) => (stickerCollection.isPrimary = true)
        );
        cycles.push(cycle);
        if (!i) firstCycle = cycle;
      }
      for (let i = 0; i < size; i++) {
        for (let j = 0; j <= size; j++) {
          const stickerCollection = [];
          for (let p = 0; p < 5; p++) {
            stickerCollection.push(
              stickerMap[`s-${attachedFace}-${p}-${i}-${j}`]
            );
          }
          firstCycle.stickerCollections.push(stickerCollection);
        }
      }
      firstCycle.stickerCollections.push([stickerMap[`s-${attachedFace}`]]);
    });
    cycles.forEach((cycle) => cycle.computeStickerCover());
    super("Dodecahedron", size << 1, faces, cycles);
    this.saveOrientation({
      axis: new Vector({ x: 1, y: 0, z: 0 }),
      angle: -Math.PI / 5,
    });
  }
}

class Tetrahedron extends Puzzle {
/**
 @param {number} [size]
 @param {number} [fullSpan]
 @param {number} [animationSteps]
 @param {Array} [colors]
 */
  constructor(size = 3, fullSpan = 200, animationSteps = 10, colors) {
    const altitude = fullSpan / Math.sqrt(2);
    const alphaM = (2 * Math.PI) / 3;
    const animationConfig = {
      steps: animationSteps,
      dAlpha: alphaM / animationSteps,
    };
    if (!colors) {colors = [];}
    //if (colors.length==0) {colors=["white","blue","lawngreen","red"];}
    if (colors.length==0) {colors=["yellow","blue","lawngreen","red"];}
    const grid = {};
    const stickerMap = {};
    const faces = [];
    const cycles = [];
    const rootPoints = [
      new Point(fullSpan, 0, altitude),
      new Point(-fullSpan, 0, altitude),
      new Point(0, fullSpan, -altitude),
      new Point(0, -fullSpan, -altitude),
    ];
    const faceConfig = [
      { points: [rootPoints[0], rootPoints[2], rootPoints[1]], color: colors[0 % colors.length] },
      { points: [rootPoints[0], rootPoints[1], rootPoints[3]], color: colors[1 % colors.length] },
      {
        points: [rootPoints[0], rootPoints[3], rootPoints[2]],
        color: colors[2 % colors.length],
      },
      { points: [rootPoints[1], rootPoints[2], rootPoints[3]], color: colors[3 % colors.length] },
    ];
    const cycleFamilyConfig = [
      {
        slices: [
          { fIndex: 0, sIJ: (row) => [row, 0], dIJ: () => [0, 1] },
          { fIndex: 1, sIJ: (row) => [row, 0], dIJ: () => [0, 1] },
          { fIndex: 2, sIJ: (row) => [row, 0], dIJ: () => [0, 1] },
        ],
        attachedFace: {
          fIndex: 3,
          steps: [() => [1, 2], () => [0, -2], () => [-1, 0]],
        },
        unitVector: new Vector(rootPoints[0]).unit(),
      },
      {
        slices: [
          {
            fIndex: 0,
            sIJ: (row) => [size - row - 1, 2 * (size - row - 1)],
            dIJ: (_row, col) => [col % 2 ? 0 : 1, col % 2 ? -1 : 1],
          },
          { fIndex: 3, sIJ: (row) => [row, 0], dIJ: () => [0, 1] },
          {
            fIndex: 1,
            sIJ: (row) => [size - 1, 2 * row],
            dIJ: (_row, col) => [col % 2 ? -1 : 0, -1],
          },
        ],
        attachedFace: {
          fIndex: 2,
          steps: [() => [1, 2], () => [0, -2], () => [-1, 0]],
        },
        unitVector: new Vector(rootPoints[1]).unit(),
      },
      {
        slices: [
          {
            fIndex: 0,
            sIJ: (row) => [size - 1, 2 * row],
            dIJ: (_row, col) => [col % 2 ? -1 : 0, -1],
          },
          {
            fIndex: 2,
            sIJ: (row) => [size - row - 1, 2 * (size - row - 1)],
            dIJ: (_row, col) => [col % 2 ? 0 : 1, col % 2 ? -1 : 1],
          },
          {
            fIndex: 3,
            sIJ: (row) => [size - 1, 2 * row],
            dIJ: (_row, col) => [col % 2 ? -1 : 0, -1],
          },
        ],
        attachedFace: {
          fIndex: 1,
          steps: [() => [1, 2], () => [0, -2], () => [-1, 0]],
        },
        unitVector: new Vector(rootPoints[2]).unit(),
      },
      {
        slices: [
          {
            fIndex: 1,
            sIJ: (row) => [size - row - 1, 2 * (size - row - 1)],
            dIJ: (_row, col) => [col % 2 ? 0 : 1, col % 2 ? -1 : 1],
          },
          {
            fIndex: 3,
            sIJ: (row) => [size - row - 1, 2 * (size - row - 1)],
            dIJ: (_row, col) => [col % 2 ? 0 : 1, col % 2 ? -1 : 1],
          },
          {
            fIndex: 2,
            sIJ: (row) => [size - 1, 2 * row],
            dIJ: (_row, col) => [col % 2 ? -1 : 0, -1],
          },
        ],
        attachedFace: {
          fIndex: 0,
          steps: [() => [1, 2], () => [0, -2], () => [-1, 0]],
        },
        unitVector: new Vector(rootPoints[3]).unit(),
      },
    ];
    faceConfig.forEach((config, f) => {
      const stickers = [];
      let preArr = [config.points[0].clone()];
      let nxtArr;
      let p;
      let q;
      let r;
      let s;
      const vI = new Vector(config.points[0], config.points[1]).multiply(
        1 / size
      );
      const vJ = new Vector(config.points[1], config.points[2]).multiply(
        1 / size
      );
      let vC;
      for (let i = 0; i < size; i++) {
        nxtArr = [];
        vC = vI.add(preArr[0]);
        nxtArr.push(new Point(vC.x, vC.y, vC.z));
        for (let j = 0; j <= i; j++) {
          vC = vJ.add(vC);
          nxtArr.push(new Point(vC.x, vC.y, vC.z));
        }
        preArr.forEach((point, j) => {
          p = point.clone();
          q = nxtArr[j].clone();
          r = nxtArr[j + 1].clone();
          p.id = `p-${f}-${i}-${j}`;
          q.id = `p-${f}-${i + 1}-${j}`;
          r.id = `p-${f}-${i + 1}-${j + 1}`;
          grid[p.id] = p.clone();
          grid[q.id] = q.clone();
          grid[r.id] = r.clone();
          stickers.push(
            new Sticker(`s-${f}-${i}-${2 * j}`, config.color, [p, q, r])
          );
          stickerMap[stickers[stickers.length - 1].id] =
            stickers[stickers.length - 1];
          if (j < preArr.length - 1) {
            p = p.clone();
            r = r.clone();
            s = preArr[j + 1].clone();
            s.id = `q-${f}-${i}-${j + 1}`;
            grid[p.id] = p.clone();
            grid[r.id] = r.clone();
            grid[s.id] = s.clone();
            stickers.push(
              new Sticker(`s-${f}-${i}-${2 * j + 1}`, config.color, [p, r, s])
            );
            stickerMap[stickers[stickers.length - 1].id] =
              stickers[stickers.length - 1];
          }
        });
        preArr = nxtArr;
      }
      faces.push(new Face(stickers));
    });
    let cycle;
    let aFace;
    let stickerCollection;
    let sI;
    let sJ;
    let dI;
    let dJ;
    cycleFamilyConfig.forEach((config) => {
      for (let c = 0; c < size; c++) {
        cycle = new Cycle(
          cycles.length,
          [],
          3,
          config.unitVector,
          animationConfig
        );
        stickerCollection = [];
        config.slices.forEach((slice) => {
          [sI, sJ] = slice.sIJ(c);
          for (let s = 0; s < 1 + 2 * c; s++) {
            [dI, dJ] = slice.dIJ(c, s);
            stickerCollection.push(stickerMap[`s-${slice.fIndex}-${sI}-${sJ}`]);
            sI += dI;
            sJ += dJ;
          }
        });
        cycle.stickerCollections.push(stickerCollection);
        cycles.push(cycle);
      }
      cycle = cycles[cycles.length - 1];
      aFace = config.attachedFace.fIndex;
      let l = size - 1;
      let d = 1;
      let s = 0;
      let t;
      let i;
      let j;
      while (l > 0) {
        i = j = s;
        stickerCollection = [];
        config.attachedFace.steps.forEach((stepConfigGetter) => {
          t = 0;
          for (let x = 0; x < l; x++) {
            const [stepI, stepJ] = stepConfigGetter(s, t);
            stickerCollection.push(stickerMap[`s-${aFace}-${i}-${j}`]);
            i += stepI;
            j += stepJ;
            t += 1;
          }
        });
        cycle.stickerCollections.push(stickerCollection);
        s += 1;
        l -= d;
        d = d === 2 ? 1 : 2;
      }
      if (stickerMap[`s-${aFace}-${s}-${s}`] && size % 3) {
        cycle.stickerCollections.push([stickerMap[`s-${aFace}-${s}-${s}`]]);
      }
    });
    cycles.forEach((cycle) => {
      cycle.stickerCollections[0].isPrimary = true;
      cycle.computeStickerCover();
    });
    super("Tetrahedron", size, faces, cycles);

    this.saveOrientation({
      axis: new Vector({ x: 0, y: 1, z: 0 }),
      angle: Math.PI / 3,
    });
  }
}

class Element {
  constructor(elem) {
    this.elem = elem;
  }
  hide() {
    if (this.elem) this.elem.style.display = 'none';
  }
  show(typ) {
    if (this.elem) this.elem.style.display = 'inline-block';
  }
  disable() {
    if (this.elem) this.elem.disabled = true;
  }
  enable() {
    if (this.elem) this.elem.disabled = false;
  }
}

class Anchor extends Element {

  sendDownload(data, filename) {
    if (this.elem) {
        this.elem.download = filename || 'image.png';
        this.elem.href = data;
        this.elem.click();
    }
  }
}

class Button extends Element {
  clickHandler(fn) {
    this.elem.addEventListener("click", fn);
  }
}

class Canvas {

   constructor(elem, isInverted) {
     this.elem = elem;
     this.isInverted = isInverted;

     this.offx = 0;
     this.offy = 0;
     this.scale = 1;

     this.ctx = this.getContext(elem);
     if (this.isInverted && this.elem) {
         this.elem.style.pointerEvents = "none"; // Ignore pointer-events.
     }
   }

  getContext(el) {
    if (el) {
        return el.getContext("2d");
    }
    return null;
  }

  clear() {
    if (this.ctx) {
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.elem.width, this.elem.height);
        this.ctx.restore();
    }
  }

  getEventOffset() {
    if (this.elem) {
        const rect = this.elem.getBoundingClientRect();
        return {
          x: rect.left + this.offx,
          y: rect.top + this.offy
        };
    }
    return {x:0, y:0};
  }

  getMouseOffset(e) {
      const ee = this.getEventOffset();
      return {
          x: e.clientX - ee.x,
          y: e.clientY - ee.y
      };
  }

  getTouchOffset(e) {
      const ee = this.getEventOffset();
      return {
          x: e.touches[0].clientX - ee.x,
          y: e.touches[0].clientY - ee.y
      };
  }

  setScale(s) {
      if (this.ctx) {
          this.scale = s;
          this.ctx.scale(s, s);
      }
  }

  setDims(w, h) {
      if (this.ctx) {
        this.elem.width = w;
        this.elem.height = h;
      }
  }

  setImageOffset(x, y) {
    if (this.ctx) {
      this.offx = x;
      this.offy = y;
      this.ctx.translate(x, y);
    }
  }

  addHandler(name, fn) {
      if (this.elem) {
          this.elem.addEventListener(name, fn);
      }
  }

  render(puz, expl) {
    if (this.ctx) {
        puz.render(this.ctx, this.isInverted, expl);
    }
  }

  setAbsPosition(x, y) {
      if (this.elem) {
          this.elem.style.position="absolute";
          this.elem.style.left=x+"px";
          this.elem.style.top=y+"px";
      }
  }

  makeCheckerboard(size, colr='gray') {
      const half = size/2;
      const offx = Util.parseInt((this.elem.width % size) / 2);
      const offy = Util.parseInt((this.elem.height % size) / 2);
      // Use 26%, rather than 25%, to eliminate single pixels on a diagonal
      // line that are not quite covered.
      return {
          bgImg: "linear-gradient(45deg, "+colr+" 26%, transparent 25%), " +
                 "linear-gradient(-45deg, "+colr+" 26%, transparent 25%), "+ 
                 "linear-gradient(45deg, transparent 75%, " + colr + " 75%), "+ 
                 "linear-gradient(-45deg, transparent 75%, " + colr +" 75%)",
          bgPos:           offx+"px " +           offy+"px, "+
                           offx+"px " +    (half+offy)+"px, "+
                    (half+offx)+"px " + (-(half-offy))+"px, "+
                 (-(half-offx))+"px " +           offy+"px",
          bgSize: size+"px "+size+"px"
      };
  }

  setBackground(colr, isSolid) {
      if (this.elem) {
          this.elem.style.backgroundColor = colr;
          if (isSolid) {
              this.elem.style.backgroundImage = "";
          } else {
              const cb = this.makeCheckerboard(30);
              this.elem.style.backgroundImage = cb.bgImg;
              this.elem.style.backgroundPosition = cb.bgPos;
              this.elem.style.backgroundSize = cb.bgSize;
          }
      }
  }

  asDataUrl() {
      if (this.elem) {
          return this.elem.toDataURL();
      }
  }
  getImage() {
      if (this.ctx) {
          return this.ctx.getImageData(0, 0, this.elem.width, this.elem.height);
      }
      return null;
   }
  putImage(img, x, y) {
      if (this.ctx) {
          return this.ctx.putImageData(img, x, y);
      }
      return null;
   }

   w() {
      return (this.elem ? this.elem.width : 0);
   }
}

class Controls extends Element {
  show(typ) {
    if (this.elem) this.elem.style.display = 'block';
  }
}

class Text extends Element {

  setText(txt){
    if (this.elem) {
        this.elem.innerText = txt;
    }
  }
}

class PolyPlayerImpl {

    constructor(config, cvs, rearCvs, ctls, initB, playB, nextB, prevB, pauseB, pngB, statE, anchE) {

        this.mainCanvas = cvs;
        this.rearCanvas = rearCvs;
        this.controlPanel = ctls;

        this.initBtn = initB;
        this.playBtn = playB;
        this.nextBtn = nextB;
        this.prevBtn = prevB;
        this.pauseBtn = pauseB;
        this.pngBtn = pngB;

        this.anchorElem = anchE;
        this.statusElem = statE;

        this.state = {
            colors: [],
            cycles: [],
            cycleIndex: 0,
            isDragging: false,
            act: null,
            isHandlersAdded: false,
        };

        this.isTetra = false;
        this.isCube = true;
        this.isOcta = false;
        this.isDodeca = false;
        this.isIcosa = false;

        this.rows = 1;

        this.peekThru = false;
        this.scramble = false;
        this.skipAnimate = false;
        this.preventTwist = false;
        this.preventRotate = false;
        this.hideControls = false;
        this.isBgSolid = false;
        this.fakeEven = false;

        this.puzzle = null;
        this.alg = [];

        this.bgColor = "";
        this.edgeColor = "";
        this.mainViewSize = 200;
        this.colors = [];
        this.stickers = [];
        this.orient = [];
        this.premoves = [];
        this.turnSpeed = 20;

        this.scaleMainPoly = 0.41;
        this.scaleRearView = 1/3;
        this.rearViewMode = 2;

        this.tcount = 0;
        this.reinit(config);
    }

    reinit(cfg) {

        if (cfg) {
            this.isTetra  = !!(cfg["isTetra"]);
            this.isOcta   = !!(cfg["isOcta"] && !this.isTetra);
            this.isDodeca = !!(cfg["isDodeca"] && !(this.isOcta || this.isTetra));
            this.isIcosa  = !!(cfg["isIcosa"] && !(this.isDodeca || this.isOcta || this.isTetra));
            this.isCube   = !!(!(this.isIcosa || this.isDodeca || this.isOcta || this.isTetra));

            this.rows = cfg["rows"] || 3;

            this.puzzle = null;

            this.fakeEven = !!cfg["fakeEven"];
            this.peekThru = !!cfg["peekThru"];
            this.scramble = !!cfg["scramble"];
            this.skipAnimate = !!cfg["skipAnimate"];
            this.preventTwist = !!cfg["preventTwist"];
            this.preventRotate = !!cfg["preventRotate"];
            this.hideControls = !!cfg["hideControls"];
            this.isBgSolid = !!cfg["isBgSolid"];

            this.colors = cfg["colors"] || [];
            this.stickers = cfg["stickers"] || [];
            this.orient = cfg["orient"] || [];
            this.premoves = cfg["premoves"] || [];
            this.alg = cfg["alg"] || [];

            this.bgColor = cfg["bgColor"] || "";
            this.edgeColor = cfg["edgeColor"] || "";
            this.turnSpeed = cfg["turnSpeed"] || 20;
            this.mainViewSize = cfg["mainViewSize"] || 200;
            this.scaleRearView = cfg["scaleRearView"] || 1 / 3;
            this.rearViewMode = (Util.isDefined(cfg["rearViewMode"]) ? cfg["rearViewMode"] : 0);

            this.scaleMainPoly = cfg["scaleMainPoly"] || this.getDefaultScaleMainPoly();
        }

        this.state.cycleIndex = 0;
        this.state.cycles = [];
        this.state.isDragging = false;
        this.state.act = null;

        const sz = this.mainViewSize;
        const sbs = this.isSideBySideView();
        const mini = this.isMiniRearView();

        const rearWidth = (sbs ? sz :sz * this.scaleRearView);
        const rearHeight = rearWidth;
        const mainWidth = (sbs ? sz*2:  (mini ? sz+(rearWidth*2) : sz));
        const mainHeight = sz;
        const mainOffx = (mini ? ((sz+(2*rearWidth))/2) : sz/2);
        const mainOffy = sz/2;

        this.mainCanvas.setDims(mainWidth, mainHeight);
        this.mainCanvas.setImageOffset(mainOffx, mainOffy);
        this.mainCanvas.setBackground(this.bgColor, this.isBgSolid);
        this.mainCanvas.clear();

        this.rearCanvas.setDims(rearWidth, rearHeight);
        this.rearCanvas.setAbsPosition(-rearWidth, -mainHeight);
        this.rearCanvas.setImageOffset(rearWidth / 2, rearWidth / 2);

        if (this.isMiniRearView()) {
            this.rearCanvas.setScale(this.scaleRearView);
        }
        this.rearCanvas.clear();

        const span = sz * this.scaleMainPoly;

        this.puzzle = this.getPuzzle(this.rows, span, this.turnSpeed, this.colors);

        this.addEventListeners();

        if (this.hideControls) {
            this.controlPanel.hide();
        } else {
            this.controlPanel.show();
        }

        this.finishPuzzle();
    }

    getDefaultScaleMainPoly() {
        if (this.isTetra) return 0.51;
        if (this.isOcta) return 0.5;
        if (this.isDodeca) return 0.57;
        if (this.isIcosa) return 0.52;
        return 0.58;
    }

    isMiniRearView() {
        return this.rearViewMode == 2;
    }

    isSideBySideView() {
        return this.rearViewMode == 1;
    }


    getPuzzle(rows, fullSpan, turnSpeed, colors) {
        if (this.isDodeca) return new Dodecahedron(rows, fullSpan, turnSpeed, colors);
        if (this.isIcosa) return new Icosahedron(rows, fullSpan, turnSpeed, colors);
        if (this.isOcta) return new Octahedron(rows, fullSpan, turnSpeed, colors);
        if (this.isTetra) return new Tetrahedron(rows, fullSpan, turnSpeed, colors);
        return new Cube(rows, fullSpan, turnSpeed, colors);
    }

    setPremoves(premoves) {
        if (!premoves) {
            premoves = [];
        }
        if (premoves.length > 0) {
            const cycleCount = this.puzzle.getCycleCount();
            const familyCount = this.puzzle.getCycleFamilyCount();
            const sliceCount = cycleCount / familyCount;

            const pm = [];
            for (const tup of premoves) {
                if (tup.length == 3) {
                    const face = (Util.parseInt(tup[0]) || 0) % familyCount;
                    const slice = (Util.parseInt(tup[1]) || 0) % sliceCount;
                    const dir = ((Util.parseInt(tup[2]) || 1) == 1 ? 1 : -1);
                    const cyc = (face * sliceCount) + slice;
                    pm.push({
                        cycle: this.puzzle.getCycle(cyc),
                        direction: dir
                    });
                }
            }
            this.puzzle.doPremoves(pm);
        }
    }

    setAlgorithm(alg) {
        if (!alg) {
            alg = [];
        }
        if (alg.length > 0) {
            const cycleCount = this.puzzle.getCycleCount();
            const familyCount = this.puzzle.getCycleFamilyCount();
            const sliceCount = cycleCount / familyCount;
            for (const tup of alg) {
                if (tup.length == 3) {
                    const face = (Util.parseInt(tup[0]) || 0) % familyCount;
                    const slice = (Util.parseInt(tup[1]) || 0) % sliceCount;
                    const dir = ((Util.parseInt(tup[2]) || 1) == 1 ? 1 : -1);
                    const cyc = (face * sliceCount) + slice;
                    this.state.cycles.push({
                        cycle: this.puzzle.cycles[cyc],
                        direction: dir
                    });
                }
            }
        }
    }

    setOrientation(orient) {
        const rotatePuzzle = 2; // Magic number in Puzzle.js
        if (!orient) {
            orient = [];
        }
        for (const tup of orient) {
            if (tup.length == 4) {
                const x1 = (Util.parseInt(tup[0]) || 0);
                const y1 = (Util.parseInt(tup[1]) || 0);
                const x2 = (Util.parseInt(tup[2]) || 0);
                const y2 = (Util.parseInt(tup[3]) || 0);
                this.puzzle.grab(x1, y1, rotatePuzzle);
                this.puzzle.drag(x2, y2);
                this.puzzle.release();
            }
        }
    }

    setStickers(stkrs) {
        const faceCount = this.puzzle.getFaceCount();
        const stickerCount = this.puzzle.getStickerCount();
        if (!stkrs) {
            stkrs = [];
        }
        for (const tup of stkrs) {
            if (tup.length == 3) {
                const face = (Util.parseInt(tup[0]) || 0) % faceCount;
                const stkr = (Util.parseInt(tup[1]) || 0) % stickerCount;
                const colr = String(tup[2]).trim() || "red";
                this.puzzle.setStickerColor(face, stkr, colr);
            }
        }
    }

    applyStickersForEvenDodecahedron() {
        if (this.isDodeca && this.fakeEven) {
            let offset = Math.pow(this.rows, 2);
            const inc = offset + this.rows;
            const ary = [];
            for (var fac = 0; fac < this.puzzle.getFaceCount(); fac++) {
                for (var r = 0; r < this.rows; r++) {
                    for (var n = 0; n < 5; n++) {
                        ary.push([fac, (offset + r) + (n * inc), 'black']);
                    }
                }
            }
            this.setStickers(ary);
        }
    }

    setInitialOrientation() {
        if (this.isTetra) {
            const lt1 = 230;
            const dn1 = 55;
            const rt1 = 150;
            const dn2 = 30;
            this.setOrientation([
                [lt1, 0, 0, 0],
                [0, 0, 0, dn1],
                [0, 0, rt1, 0],
                [0, 0, 0, dn2]
            ]);
            return;
        }

        if (this.isOcta) {
            const up = 15;
            const rt = 50;
            const dn = 15;
            this.setOrientation([
                [0, up, 0, 0],
                [0, 0, rt, 0],
                [0, 0, 0, dn]
            ]);
            return;
        }

        if (this.isIcosa) {
            const up = 140;
            this.setOrientation([
                [0, up, 0, 0]
            ]);
            return;
        }
    }

    setEdgeStickers(colr) {
        if (colr) {
            const stkrs = [];
            const sz = this.rows;
            if (this.isTetra && sz > 3) {
                for (var fac of [0, 1, 2, 3]) {
                    for (var n=0, tri=-1; n<sz-1; n++, tri+=2) {
                        const sq = n*n;
                        stkrs.push([fac, sq, colr]);
                        stkrs.push([fac, sq+1, colr]);
                        if (tri > 0) {
                            stkrs.push([fac, sq+tri, colr]);
                            stkrs.push([fac, sq+tri+1, colr]);
                        }
                    }
                    for (var n=(sz-1)*(sz-1); n<(sz*sz); n++) {
                        stkrs.push([fac, n, colr]);
                    }
                }
            }
            else if (this.isCube && sz > 2) {
                for (var fac of [0, 1, 2, 3, 4, 5]) {
                    for (var a=0; a<sz; a++) {
                        stkrs.push([fac, a, colr]);
                    }
                    for (var c=sz; c<(sz-1)*sz; c+=sz) {
                        stkrs.push([fac, c, colr]);
                        stkrs.push([fac, c+sz-1, colr]);
                    }
                    for (var c=(sz-1)*sz; c<sz*sz; c++) {
                        stkrs.push([fac, c, colr]);
                    }
                }
            }
            else if (this.isOcta && sz > 3) {
                for (var fac of [0, 1, 2, 3, 4, 5, 6, 7]) {
                    for (var n=0, tri=-1; n<sz-1; n++, tri+=2) {
                        const sq = n*n;
                        stkrs.push([fac, sq, colr]);
                        stkrs.push([fac, sq+1, colr]);
                        if (tri > 0) {
                            stkrs.push([fac, sq+tri, colr]);
                            stkrs.push([fac, sq+tri+1, colr]);
                        }
                    }
                    for (var n=(sz-1)*(sz-1); n<(sz*sz); n++) {
                        stkrs.push([fac, n, colr]);
                    }
                }
            }
            else if (this.isDodeca && sz > 0) {
                for (var fac of [0,1,2,3,4,5,6,7,8,9,10,11]) {
                    for (var y=0; y<5; y++) {
                        const k = sz;
                        const g = k * (k+1);
                        const offs = y*g;
                        for (var n=offs; n<offs+k; n++) {
                            stkrs.push([fac, n, colr]);
                        }
                        for (var n=(offs+k); n<(y+1)*g; n+=k) {
                            stkrs.push([fac, n, colr]);
                        }
                    }
                }
            }
            this.setStickers(stkrs);
        }
    }

    finishPuzzle() {
        this.setEdgeStickers(this.edgeColor);

        this.setStickers(this.stickers);

        this.applyStickersForEvenDodecahedron();

        this.setInitialOrientation();
        this.setOrientation(this.orient);

        if (this.scramble) {
            const pm = [];
            for (var i = 0; i < this.puzzle.getCycleCount() * 3; i++) {
                const fac = Math.floor(Math.random() * this.puzzle.getFaceCount());
                const slc = Math.floor(Math.random() * this.puzzle.getCycleCount());
                const dir = Math.random() < 0.5 ? -1 : 1;
                pm.push([fac, slc, dir]);
            }
            this.setPremoves(pm);
        } else {
            this.setPremoves(this.premoves);
        }
        this.setAlgorithm(this.alg);

        this.redraw(false); // Don't animate redraw.
        this.enablePlayButton();
        this.updateStatus();
    }

    enablePlayButton() {
        this.pauseBtn.hide();
        this.playBtn.show();
        this.nextBtn.enable();
        this.prevBtn.enable();
        this.initBtn.enable();
        this.pauseBtn.enable();
        if (this.state.cycleIndex == 0) {
            this.prevBtn.disable();
        }
        if (this.state.cycleIndex >= this.state.cycles.length) {
            this.nextBtn.disable();
        }
        if (this.state.cycles.length == 0 || this.state.cycleIndex >= this.state.cycles.length) {
            this.playBtn.disable();
        } else {
            this.playBtn.enable();
        }
    }

    redraw(animate) {
        this.puzzle.update(animate);
        this.mainCanvas.clear();
        this.mainCanvas.render(this.puzzle, this.peekThru);
        if (this.rearViewMode) {
            this.rearCanvas.clear();
            this.rearCanvas.render(this.puzzle, this.peekThru);
        }
    }

    nextMove() {
        if (this.state.cycleIndex < this.state.cycles.length) {
            const tw = [this.state.cycles[this.state.cycleIndex]];
            this.puzzle.scrumble(tw);
            this.anim();
            this.state.cycleIndex++;
        }
    }


    prevMove() {
        if (this.state.cycleIndex > 0) {
            this.state.cycleIndex--;
            const cur = this.state.cycles[this.state.cycleIndex];
            const tw = [{
                cycle: cur.cycle,
                direction: -(cur.direction),
            }];
            this.puzzle.scrumble(tw);
            this.anim();
        }
    }

    updateStatus() {
        if (this.state.cycles.length > 0) {
            this.statusElem.setText(this.state.cycleIndex + '/' + this.state.cycles.length);
        }
    }

    anim() {
        if (this.puzzle.isAnimationActive() || this.state.isDragging) {
            this.redraw(!this.skipAnimate);
            setTimeout(() => this.anim(), 1);
        } else {
            this.updateStatus();
            if (this.state.act == 'play' && (this.state.cycleIndex < this.state.cycles.length)) {
                this.nextMove();
                return;
            }
            this.enablePlayButton();
            this.state.act = null;
        }
    }

    enablePauseButton(isFwdOrBack = false) {
        this.playBtn.hide();
        this.pauseBtn.show();
        this.nextBtn.disable();
        this.prevBtn.disable();
        this.initBtn.disable();
        if (isFwdOrBack) {
            this.pauseBtn.disable();
        }
    }

    setTwistable(val) {
        this.preventTwist = !!!val;
    }

    setRotatable(val) {
        this.preventRotate = !!!val;
    }

    addEventListeners() {

        if (this.state.isHandlersAdded) {
            return;
        }

        this.mainCanvas.addHandler("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!this.state.isDragging) {
                this.state.isDragging = true;
                this.anim();
            }
            const pos = this.mainCanvas.getMouseOffset(e);
            const ROTATE = 2; // Magic value in Puzzle.js
            this.puzzle.grab(pos.x, pos.y, e.ctrlKey ? ROTATE : e.button);
        });

        this.mainCanvas.addHandler("mousemove", (e) => {
            if (this.state.isDragging) {
                e.preventDefault();
                e.stopPropagation();
                const pos = this.mainCanvas.getMouseOffset(e);
                const dat = this.puzzle.drag(pos.x, pos.y, !this.preventTwist, !this.preventRotate);
                // dat could be undefined or hold orientation info or moved layer info.
           }
        });

        this.mainCanvas.addHandler("mouseup", (e) => {
            this.state.isDragging = false;
            e.preventDefault();
            e.stopPropagation();
            this.puzzle.release();
        });

        this.mainCanvas.addHandler("mouseleave", (e) => {
            this.state.isDragging = false;
            this.puzzle.release();
        });

        this.mainCanvas.addHandler("touchstart", (e) => {
            const ROTATE = 2; // Magic value in Puzzle.js
            this.tcount = 0;
            e.preventDefault();
            e.stopPropagation();
            if (!this.state.isDragging) {
                this.state.isDragging = true;
                this.anim();
            }
            const pos = this.mainCanvas.getTouchOffset(e);
            if (this.preventTwist && !this.preventRotate) {
                this.puzzle.grab(pos.x, pos.y, ROTATE);
            } else {
                this.puzzle.grab(pos.x, pos.y, 1);
            }
        });

        this.mainCanvas.addHandler("touchmove", (e) => {
            if (this.state.isDragging) {
                e.preventDefault();
                e.stopPropagation();
                const pos = this.mainCanvas.getTouchOffset(e);
                // this.puzzle.drag(pos.x, pos.y, !this.preventTwist, !this.preventRotate);
                const dat = this.puzzle.drag(pos.x, pos.y, !this.preventTwist, !this.preventRotate);
                // dat could be undefined or hold orientation info or moved layer info.
            }
        });

        this.mainCanvas.addHandler("touchend", (e) => {
            this.state.isDragging = false;
            e.preventDefault();
            e.stopPropagation();
            this.puzzle.release();
        });

        this.mainCanvas.addHandler("touchcancel", (e) => {
            this.state.isDragging = false;
            this.puzzle.release();
        });

        this.playBtn.clickHandler((e) => {
            if ((this.state.cycleIndex < this.state.cycles.length) && !this.puzzle.isAnimationActive()) {
                this.state.act = 'play';
                this.puzzle.scrumble(this.alg);
                this.enablePauseButton();
                this.nextMove();
            }
        });

        this.pauseBtn.clickHandler((e) => {
            this.state.act = 'pause';
            this.enablePlayButton();
        });

        this.nextBtn.clickHandler((e) => {
            if ((this.state.cycleIndex < this.state.cycles.length) && !this.puzzle.isAnimationActive()) {
                this.state.act = 'next';
                this.enablePauseButton(true);
                this.nextMove();
            }
        });

        this.prevBtn.clickHandler((e) => {
            if ((this.state.cycleIndex > 0) && !this.puzzle.isAnimationActive()) {
                this.state.act = 'prev';
                this.enablePauseButton(true);
                this.prevMove();
            }
        });

        this.initBtn.clickHandler((e) => {
            this.reinit(null);
        });

        this.pngBtn.clickHandler((e) => {
            if (this.anchorElem) {
                const xoff = this.mainCanvas.w()-this.rearCanvas.w();
                const yoff = 0;
                this.mainCanvas.putImage(this.rearCanvas.getImage(), xoff, yoff);

                // Re-render main image because the mini view can overwrite main image.
                this.mainCanvas.render(this.puzzle, this.peekThru);

                this.anchorElem.sendDownload(this.mainCanvas.asDataUrl());
            }
        });

        this.state.isHandlersAdded = true;
    }
}

class PolyPlayer extends PolyPlayerImpl {

    constructor(config, cvs, rearCvs, ctls, initB, playB, nextB, prevB, pauseB, pngB, infoE, anchE) {

        super(ConfigParser.parse(config),
              new Canvas(cvs, false),
              new Canvas(rearCvs, true),
              new Controls(ctls),
              new Button(initB),
              new Button(playB),
              new Button(nextB),
              new Button(prevB),
              new Button(pauseB),
              new Button(pngB),
              new Text(infoE),
              new Anchor(anchE)
        );
    }

    loadConfig(cfg) {
        super.reinit(ConfigParser.parse(cfg));
    }

}
class PolyPlayers {
    constructor(doc, tagName='twedra-player') {
       this.doc = doc;
       this.tagName = tagName;
       this.players = [];
       this.reinit();
    }

    static populatePage(doc, tag) {
        if (doc) {
            return new PolyPlayers(doc, tag);
        }
        return null;
    }

    reinit() {
      this.players.length = 0;
      const elems = this.doc.getElementsByTagName(this.tagName);
      for (const elem of elems) {
          this.players.push(this.buildPlayer(elem));
      };
    }

    getPlayers() {
        return this.players;
    }

    create(name) {
        return this.doc.createElement(name);
    }


    readTwedraConfig(elem) {
          const cfgStr = elem.getAttribute('twedra-config') || "{}";
          return ConfigParser.parse(cfgStr);
    }

    readTwizzleAttributes(elem) {
        // Twizzle is under develoment, so attributes may change.
        return {
          alg: elem.getAttribute('alg') || "",
          puzzle: elem.getAttribute('puzzle') || "",
          background: elem.getAttribute('background') || "",
          hintFacelets: elem.getAttribute('hint-facelets') || "",
          controlPanel: elem.getAttribute('control-panel') || "",
          backView: elem.getAttribute('back-view') || "",
          experimentalSetupAlg: elem.getAttribute('experimental-setup-alg') || "",
       }
    }

    mergeValues(pc, tw) {
        // tw properties win, if they exist.
        if (tw.alg) pc.alg = tw.alg;
        if (tw.puzzle) pc.name = tw.puzzle;
        if (tw.background) {
            if (/checkered/.test(tw.background)) {
                pc.isBgSolid = false;
            } else {
                pc.isBgSolid = true;
                pc.bgColor = tw.background;
            }
        }
        if (tw.hintFacelets=="floating") pc.peekThru = true;
        if (tw.controlPanel=="none") pc.hideControls = true;
        if (tw.experimentalSetupAlg) pc.premoves = tw.experimentalSetupAlg;
        if (tw.backView=="none") pc.rearViewMode = 0;
        if (tw.backView=="side-by-side") pc.rearViewMode = 1;
        if (tw.backView=="top-right") pc.rearViewMode = 2;
        return pc;
    }

    createControlPanel(cfg, btns, inf) {
        const div = this.create("div");
        div.appendChild(btns.pngB);
        div.appendChild(btns.initB);
        div.appendChild(btns.prevB);
        div.appendChild(btns.playB);
        div.appendChild(btns.pauseB);
        div.appendChild(btns.nextB);
        div.appendChild(inf);
        return div;
    }

    createStatus() {
        const s = this.create('div');
        s.style.display = 'inline-block';
        s.style.width = '4em';
        s.style.textAlign = 'center';
        s.style.position = 'absolute';
        return s;
    }

    _createCanvas() {
        const cvs = this.create("canvas");
        cvs.style.cursor = "pointer";
        cvs.userSelect = "none";
        cvs.WebkitUserSelect = "none";
        cvs.MozUserSelect = "none";
        cvs.MsUserSelect = "none";
        return cvs;
    }

    createMainCanvas() {
        return this._createCanvas();
    }

    createRearCanvas() {
        return this._createCanvas();
    }

    createButton(name) {
        const btn = this.create("button");
        btn.innerText=name;
        return btn;
    }

    createRearCanvasHolder(cvs) {
        // Place rear canvas in a div for layout purposes.
        const div = this.create("div");
        div.style.position = 'relative';
        div.style.display = 'inline-block';
        div.appendChild(cvs);
        return div;
    }

    createUiElements(cfg) {
        // Make 'Play' and 'Pause' text the same to prevent changing button size.
        const btns = {
            initB: this.createButton('Init'),
            prevB: this.createButton('Prev'),
            playB: this.createButton('||>'), // Play
            pauseB: this.createButton('||>'), // Pause
            nextB: this.createButton('Next'),
            pngB: this.createButton('PNG'),
        };
        const stat = this.createStatus();

        const rCvs = this.createRearCanvas();

        return {
            mainCvs: this.createMainCanvas(),
            rearCvs: rCvs,
            holder:  this.createRearCanvasHolder(rCvs),
            panel:   this.createControlPanel(cfg, btns, stat),
            btns:    btns,
            statusE: stat,
            anchorE: this.create('a'),
        }
    }

    buildPlayer(elem) {
          elem.innerHTML = '';

          // Add frame immediately so that errors can be shown to user.
          const frame = this.create("div");
          frame.classList.add('polyframe');
          elem.appendChild(frame);

          try {
              const tw = this.readTwizzleAttributes(elem);
              const pc = this.readTwedraConfig(elem);
              const cfg = this.mergeValues(pc, tw);

              const uie = this.createUiElements(cfg);
              frame.appendChild(uie.mainCvs);
              frame.appendChild(uie.holder);
              frame.appendChild(uie.panel);

              const b = uie.btns;
              return new PolyPlayer(cfg, uie.mainCvs, uie.rearCvs, uie.panel, b.initB, b.playB, b.nextB, b.prevB, b.pauseB, b.pngB, uie.statusE, uie.anchorE);
        } catch (err) {
            console.log(err);
            frame.innerText = err.message;
            return null;
        }
    }

}

class StrIter {
    constructor(str) {
        this.i = 0;
        this.str = str || '';
        this.n = 0;
        this.maxn = 1000;
    }

    hasNext() {
this.n++;if (this.n > this.maxn) {throw new Error('bad loop1');}
        return (this.i < this.str.length);
    }
    
    getNext() {
this.n++;if (this.n > this.maxn) {throw new Error('bad loop2');}

        if (this.i < this.str.length) {
            const ch = this.str[this.i];
            this.i++;
            return ch;
        }
        return null;
    }
    readInt() {
        let dig = '';
        while (this.hasNext() && this.nextIsDigit()) {
            dig += this.getNext();
        }
        return dig;
    }
    nextIsSpace() {
        if (this.hasNext()) {
            return /\s/.test(this.str[this.i]);
        }
        return false;
    }
    nextIsDigit() {
        if (this.hasNext()) {
            return /\d/.test(this.str[this.i]);
        }
        return false;
    }
}

class ConfigParser {

    // Config keys must be quoted to prevent the Closure compiler from altering them.
    static parse(val) {

        const cfg = ConfigParser.constructConfigObject(val);
        const flds = ConfigParser.getPolyType(cfg);

        const ptype = flds.ptype;
        cfg["isTetra"] = (ptype == 't');
        cfg["isCube"] = (ptype == 'c');
        cfg["isOcta"] = (ptype == 'o');
        cfg["isDodeca"] = (ptype == 'd');
        cfg["isIcosa"] = (ptype == 'i');

        cfg["rows"] = flds.rows;
        cfg["fakeEven"] = flds.fakeEven;

        const info = ConfigParser.getInfo(
            cfg["isTetra"],
            cfg["isCube"],
            cfg["isOcta"],
            cfg["isDodeca"],
            cfg["isIcosa"]
        );

        cfg["orient"] = ConfigParser.parseOrient(cfg["orient"]);

        const spirals = {
            alg: ConfigParser.parseMoves(cfg["alg"], info.faceNameMap, cfg["rows"]),
            colors: ConfigParser.parseColors(cfg["colors"], info.faceCount),
            premoves: ConfigParser.parseMoves(cfg["premoves"], info.faceNameMap, cfg["rows"]),
            stickers: ConfigParser.parseStickers(cfg["stickers"], info.faceNameMap),
        }

        return ConfigParser.remapSpiralVals(cfg, spirals, info);
    }

    static remapSpiralVals(cfg, spir, info) {
        if (spir.colors) {
            const cc = [...spir.colors];
            for (var i=0; i<spir.colors.length; i++) {
                const k = info.faceNumMap[i];
                if (k < spir.colors.length) {
                    cc[i] = spir.colors[k];
                }
            }
            cfg["colors"] = cc;
        }
        if (spir.stickers) {
            cfg["stickers"] = spir.stickers.map(a => [info.faceNumMap[a[0]], a[1], a[2]]);
        }
        if (spir.premoves) {
            cfg["premoves"] = spir.premoves.map(a => {
                const face = a[0];
                const depth = a[1];
                const dir = a[2];
                return [
                     info.cycleMap[face],
                     info.adjustDepth(face, depth, cfg["rows"]),
                    info.adjustDir(face,dir)
                 ];
           });
        }
        if (spir.alg) {
            cfg["alg"] = spir.alg.map(a => {
                const face = a[0];
                const depth = a[1];
                const dir = a[2];
                return [
                     info.cycleMap[face],
                     info.adjustDepth(face, depth, cfg["rows"]),
                    info.adjustDir(face,dir)
                 ];
           });
        }
        return cfg;
    }


    static getInfo(t, c, o, d, i) {
        const inf = ConfigParser.getDefaultInfo(t, c, o, d, i);
            // orig inf.faceNumMap = {0:4, 1:2, 2:1, 3:3, 4:0, 5:5},
//            inf.faceNumMap = {0:0, 1:2, 2:1, 3:3, 4:4, 5:5};

        return inf;
    }


       // The icosahedron and dodecahedron are duals. Since the icosahdron
       // turns on (12) vertices, and the dodecahedron turns on (12) faces, we
       // can use the same mapping.


    static getDefaultInfo(t, c, o, d, i) {
        if (t) return {
            faceCount: 4,
            faceNameMap: {'d':2,'f':0,'l':3,'r':1},
            faceNumMap: {0:2, 1:1, 2:0, 3:3},
            cycleMap: {0:1, 1:2, 2:3, 3:0},
            adjustDepth: (face, depth, rows) => (rows - depth%rows -1),
            adjustDir: (face, dir) => dir,
        };
        if (o) return {
            faceCount: 8,
            faceNameMap: {'f':3,'u':0,'i':1,'r':2,'l':4,'e':5,'b':6,'d':7},
            faceNumMap: {0:2, 1:1, 2:0, 3:3, 4:5, 5:6, 6:7, 7:4},
            cycleMap: {0:2, 1:1, 2:0, 3:3, 4:1, 5:0, 6:3, 7:2}, // Eight faces; four cycles.
            adjustDepth: (face, depth, rows) => (face > 3 ? rows - depth%rows -1 : depth),
            adjustDir: (face, dir) => (face > 3 ? dir : -dir),
        };
        if (d) return {
            faceCount: 12,
            faceNameMap: {'f':0,'u':1,'r':2,'l':5,'b':11,'h':3,'e':6,'i':7,'g':8,'p':10,'t':4,'d':9},
            faceNumMap: {0:5, 1:7, 2:9, 3:0, 4:2, 5:11, 6:3, 7:1, 8:8, 9:4, 10:10, 11:6},
            cycleMap: {0:5, 1:7, 2:9, 3:0, 4:2, 5:11, 6:3, 7:1, 8:8, 9:4, 10:10, 11:6},
            adjustDepth: (face, depth, rows) => depth,
            adjustDir: (face, dir) => -dir,
        };
        if (i) return {
            faceCount: 20,
            faceNameMap: {'f':0,'u':1,'r':2,'l':5,'b':11,'h':3,'e':6,'i':7,'g':8,'p':10,'t':4,'d':9},
            faceNumMap: {0:15,1:3,2:4,3:16,4:14,5:6,6:5,7:13,8:19,9:2,10:1,11:0,12:17,13:10,14:7,15:8,16:9,17:12,18:18,19:11},
            cycleMap: {0:9, 1:0, 2:8, 3:2, 4:7, 5:6, 6:1, 7:4, 8:5, 9:3, 10:11, 11:10}, // vertices, not faces
            adjustDepth: (face, depth, rows) => depth,
            adjustDir: (face, dir) => -dir,
        };
        return { // Default to cube.
            faceCount: 6,
            faceNameMap: {'l':4,'r':2,'u':1,'d':3,'f':0,'b':5},
            faceNumMap: {0:4, 1:2, 2:1, 3:3, 4:0, 5:5},
            cycleMap: {0:0, 1:1, 2:2, 3:1, 4:2, 5:0}, // Six faces; three cycles.
            adjustDepth: (face, depth, rows) => ([2,3,5].includes(face) ? rows - depth%rows -1 : depth),
            adjustDir: (face, dir) => ([1,4,5].includes(face) ? -dir : dir),
        };
    }


    static constructConfigObject(val) {
        if (Util.isString(val)) {
            const singleLine = Util.removeNewlines(Util.removeComments(val)).trim();
            return ConfigParser.parse2(singleLine);
        }
        // if (!Util.isDefined(val) || !val) {
        if (!val) {
            return {};
        }
        return val;
    }

    static codeFields(code, ans) {
        if (code) {
            const typ = code.substring(0,1);
            let n = Util.parseInt(code.substring(1));
            const isEven = ((n % 2) == 0);
            if (typ == 'd' ) {
                n = Math.floor(n/2);
            }
            ans.ptype = typ;
            ans.rows = n;
            ans.fakeEven = (typ == 'd') && isEven;
        }
        return ans;
    }

  static puzzleNameToCode(name) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      switch(slug) {
        case "minipyraminx": return 't2';
        case "pyraminx": return 't3';
        case "mastertetraminx": // fall-thru
        case "masterpyraminx": return 't4';
        case "professorpyraminx": return 't5';
        case "royalpyraminx": return 't6';

        case "pocketcube": return 'c2';
        case "cube": return 'c3';
        case "rubiksrevenge": return 'c4';
        case "professorscube": return 'c5';

        case "octo2": return 'o2';
        case "fto": // fall-thru
        case "octo3": return 'o3';
        case "octo4": return 'o4';
        case "octo5": return 'o5';
        case "octo6": return 'o6';
        case "octo7": return 'o7'

        case "kilominx": return 'd2';
        case "megaminx": return 'd3';
        case "masterkilominx": return 'd4';
        case "gigaminx": return 'd5';
        case "elitekilominx": return 'd6';
        case "teraminx": return 'd7';
        case "kilominx8": return 'd8';
        case "petaminx": return 'd9';
        case "kilominx10": return 'd10';
        case "examinx": return 'd11';

        case "icosa2": return 'i2';
        case "icosa3": return 'i3';
        case "icosa4": return 'i4';
        case "icosa5": return 'i5';
        case "icosa6": return 'i6';
        case "icosa7": return 'i7';
        case "icosa8": return 'i8';

        default: // Handle NxNxN
            const parts = slug.split('x');
            if (parts.length == 3) {
                if (parts[0] == parts[1] && parts[1] == parts[2]) {
                    const rowVal = Util.parseInt(parts[0]);
                    if (rowVal > 0) {
                        return 'c'+rowVal;
                    }
                }
            }
            break;
        }
        if (slug.match(/^[cdiot]\d+$/)) {
            const typ = slug.substring(0,1);
            let num = slug.substring(1);
            num = Math.max(1, Util.parseInt(num));
            // All polyhedra except dodecahedrons allow '1'.
            if (typ == 'd' && num < 2) {
                num++;
            }
            return typ + num;
        }
        return 'c3';
    }

    static getPolyType(cfg) {
        const ans = {
            ptype: cfg["ptype"] || 'c',
            rows: Util.parseInt(cfg["rows"]) || 3,
            fakeEven: !!cfg["fakeEven"],
        };
        if (cfg["name"]) {
            return ConfigParser.codeFields(ConfigParser.puzzleNameToCode(cfg["name"]), ans);
        }
        return ans;
    }








    static toFields(str) {
        return str.trim().split(/[;]+/).map(s => s.trim());
    }

   static getFaceNum(faceNameMap, name) {
        const n = Util.parseInt(name);
        if (Number.isInteger(n)) return n;
        const nm = (name || '').toLowerCase();
        let val = faceNameMap[nm];
        if (!Util.isDefined(val)) {
            console.log(nm + ' not found in facemap. Setting to 0.');
            val = 0;
        }
        return val;
    }


    static parseColors(val, faceCount) {
        if (Util.isString(val)) {
            const ans = [];
            const trimmed = val.trim();
            if (trimmed.length) {
                const ary = trimmed.split(/[; ,]+/);
                const lastColor = ary[ary.length-1];
                ans.length = faceCount;
                ans.fill(lastColor);

                for (var i=0; i<ary.length && i<ans.length; i++) {
                        ans[i] = ary[i]; // color
                }
            }
            return ans;
        } else {
            return val;
        }
    }

    static parseStickers(obj, faceNameMap) {
        if (Util.isString(obj)) {
            const ans = [];
            const fields = ConfigParser.toFields(obj)
                               .map(a=>a.trim().split(/,/).map(d=>d.trim()))
            for (const fld of fields) {
                const colr = fld.shift(); // Remove first element.
                for (const faces of fld) {
                    const spots = faces.split(/\s+/);
                    const faceStr = spots.shift(); // Remove first element.
                    for (const spotStr of spots) {
                        const spiralNum = ConfigParser.getFaceNum(faceNameMap, faceStr);
                        const spotNum = Util.parseInt(spotStr);
// console.log(colr, spiralNum, spotNum);
                            ans.push([spiralNum, spotNum, colr]);
                    }
                }
            }
            return ans;
        } else {
            return obj;
        }
    }


   // 'u 100' is the same as 'd -100'
    static parseOrient(obj) {
        if (Util.isString(obj)) {
            const ans = []
            const fields = ConfigParser.toFields(obj)
                       .map(a => a.split(/\s+/)
                                  .map(s => s.trim().toLowerCase()))
                       .filter(b => b.length == 2);
            for (const fld of fields) {
                const dir = fld[0];
                const dist = Util.parseInt(fld[1]);
                if (dist) {
                    switch(dir) {
                        case 'l': ans.push([dist,    0,    0,    0]); break;
                        case 'u': ans.push([   0, dist,    0,    0]); break;
                        case 'r': ans.push([   0,    0, dist,    0]); break;
                        case 'd': ans.push([   0,    0,    0, dist]); break;
                    }
                }
            }
            return ans;
        } else {
            return obj;
        }
    }


// Face Names to Face Numbers
// Face Numbers and dir to cycles

    static isNeg(val) {
        return Object.is(val, -0) || val < 0;
    }

    static parseMoves(val, faceNameMap, rows) {
        if (Util.isString(val)) {
            let spiralMovs;
            if (/[a-zA-Z]/.test(val)) {
                spiralMovs = ConfigParser.parseAlphaMoves(val, faceNameMap);
            } else {
                spiralMovs = ConfigParser.parseNumericMoves(val, faceNameMap);
            }
            return spiralMovs;
        } else {
            return val;
        }

    }


// M middle lane. Down is clockwise.
// E equator  Right is clockwise.
// S slice / placemats. Right is clockwise.
// 3Rw3'
// depth face wide turns dir
// D++
    static parseAlphaMoves(str, faceNameMap) {
        const alp = new AlgParser().parse(str);
        const ary = alp.split(/\s+/);
        const ans = [];
        for (const a of ary) {
            let depth = 1;
            let faceName = null;
            let isWide = false;
            let numTurns = 1;
            let dir = 1;

            let str = a;
            if (str.endsWith("'")) {
                dir = -1;
                str = str.substring(0, str.length-1);
            }

            if (str.endsWith("w") || str.endsWith("W")) {
                isWide = true;
                str = str.substring(0, str.length-1);
            }

            const mat = str.match(/\d+$/);
            if (mat) {
                const s = mat[0];
                str = str.substr(0, str.length - s.length);
                numTurns = Util.parseInt(s);
            }


            const mat2 = str.match(/^\d+/);
            if (mat2) {
                const s2 = mat2[0];
                str = str.substr(s2.length);
                depth = Util.parseInt(s2);
            }

            if (str.length == 1 && !ConfigParser.isReorient(str)) {
                faceName = str;
                const beg = (isWide ? 0 : depth-1);
                if (isWide && depth == 1) {
                    depth = 2;
                }
                for (var d=beg; d<depth; d++) {
                    for (var t=0; t<numTurns; t++) {
                        const spiralNum = ConfigParser.getFaceNum(faceNameMap, faceName);
                        ans.push([spiralNum, d, dir]);
                    }
                }
            } else {
                console.log('could not parse '+a);
            }

        }
        return ans;
        
    }

    static isReorient(str) {
        return (str == 'x' || str == 'y' || str == 'z');
    }

    static parseNumericMoves(item, facemap) {
        if (Util.isString(item)) {
            const aoa = ConfigParser.toFields(item).map(a => a.split(/\s+/)
                                                  .map(d => Util.parseInt(d)));
            const ans = [];
            for (const a of aoa) {
                 if (a.length == 2) {
                     if (ConfigParser.isNeg(a[1])) {
                        a[1] = Math.abs(a[1]);
                        a.push(-1);
                     } else {
                         a.push(1);
                     }
                 }
                 if (a.length == 3) {
                    const turns = Math.abs(a[2]);
                    a[2] = (a[2] < 1 ? -1 : 1);
                    for (var k=0; k<turns; k++) {
                        ans.push(a);
                    }
                 }
            }
            return ans;
        } else {
            return item;
        }
    }


    static parse2(str) {
        let s = (str || '').trim();
        const isJson = s.startsWith('{');
        let cfg;

        if (! isJson) {
            s = '{' + s + '}';
        }
        try {
              return JSON.parse(s);
        } catch (err) {
              // Ignore.
        }
        return JSON.parse(ConfigParser.quoteKeys(ConfigParser.convertQuotes(Util.removeNewlines(s))));
    }

    // Escape double-quotes and un-escape single-quotes.
    // ary is an array of single characters.
    // join all characters in the array and surround the string with double quotes.
    // The string should be valid.
    static adjustQuotes(ary) {
        let isEscaped = false;
        const ans = [];
        for (var i=0; i<ary.length; i++) {
            const ch = ary[i];
            if (isEscaped) {
                if (ch != "'") {
                    ans.push('\\');
                }
                ans.push(ch);
                isEscaped = false;
            } else if (ch == '\\') {
                isEscaped = true;
            } else if (ch == '"') {
                ans.push('\\');
                ans.push(ch);
            } else {
                ans.push(ch);
            }
        }
        return ans;
    }

    static convertQuotes(str) {
        let inDblQuote = false;
        let inSngQuote = false;
        let inEscSngQuote = false;
        let inEscDblQuote = false;
        let skipNext = false;
        const tmp = [];
        const ans = [];
        for(var i=0; i<str.length; i++) {
            const ch = str[i];
            if (skipNext) {
                if (inSngQuote || inDblQuote) {
                    tmp.push('\\');
                    tmp.push(ch);
                } else if (inEscDblQuote) {
                    ans.push('"');
                    ans.push(...tmp);
                    ans.push('"');
                    inEscDblQuote = false;
                    tmp.length = 0;
                } else if (inEscSngQuote) {
                    ans.push('"');
                    ans.push(...ConfigParser.adjustQuotes(tmp));
                    ans.push('"');
                    inEscSngQuote = false;
                    tmp.length = 0;
                } else if (ch == '"') {
                    ans.push(...tmp);
                    tmp.length = 0;
                    inEscDblQuote = true;
                } else if (ch == "'") {
                    ans.push(...tmp);
                    tmp.length = 0;
                    inEscSngQuote = true;
                } else {
                    tmp.push('\\');
                    tmp.push(ch);
                }
                skipNext = false;
            } else if (ch == '\\') {
                skipNext = true;
            } else if (inEscSngQuote) {
                tmp.push(ch);
            } else if (inEscDblQuote) {
                tmp.push(ch);
            } else if (inSngQuote) {
                if (ch == "'") {
                    ans.push('"');
                    ans.push(...ConfigParser.adjustQuotes(tmp));
                    ans.push('"');
                    tmp.length = 0;
                    inSngQuote = false;
                } else {
                    tmp.push(ch);
                }
            } else if (inDblQuote) {
                if (ch == '"') {
                    ans.push('"' + tmp.join('') + '"');
                    tmp.length = 0;
                    inDblQuote = false;
                } else {
                    tmp.push(ch);
                }
            } else if (ch == '"') {
                if (tmp.length) {
                    ans.push(...tmp);
                }
                tmp.length = 0;
                inDblQuote = true;
            } else if (ch == "'") {
                if (tmp.length) {
                    ans.push(...tmp);
                }
                tmp.length = 0;
                inSngQuote = true;
            } else {
                tmp.push(ch);
            }
        }
        if (tmp.length) {
            ans.push(...tmp);
        }
        if (inDblQuote || inSngQuote || skipNext) {
            throw new Error('Quote not closed: '+tmp.join(''));
        }
        return ans.join('');
    }

    static quoteKeys(str) {
        return str.replace(/(['"])?([a-zA-Z0-9_\$]+)(['"])?\s*:/g, '"$2":');
    }
    
}

class AlgParser {

    constructor() {
    }

    prep(str) {
        return this.removeNewlines(this.removeComments(str.trim()));
    }
    parse(str) {
        const si = new StrIter(this.prep(str).trim());
        const ans = this.parse2(si);
//        console.log(ans);
        return ans;
    }
    parse2(si, term = null) {
        let ans = '';
        let tok = '';
        while (si.hasNext()) {
            const ch = si.getNext();
            if (ch == term) {
                return ans+tok;
            } else if (ch == ' ') {
                ans += tok + ' ';
                tok='';
            } else if (ch == '(') {
                const grp = this.parse2(si, ')');
                const rep = Util.parseInt(si.readInt() || '1');
                const ary = [];
                for (var i=0; i<rep; i++) {
                    ary.push(grp);
                }
                ans += ary.join(' ');
            } else if (ch == '[') {
                const a = this.parse2(si, ',').trim();
                const b = this.parse2(si, ']').trim();
                ans += [a, b, this.inverse(a), this.inverse(b)].join(' ');
            } else {
                tok += ch;
            }
        }
        if (tok) ans += tok;
        return ans;
    }

    inverse(str) {
        return str.trim().split(/\s+/).reverse().map(this.inverse2).join(' ');
    }

    inverse2(s) {
        if (s.length > 1 && s.endsWith("'")) {
            return s.substring(0, s.length-1);
        }
        return s+"'"
    }

    removeComments(str) {
        // ??? Dollar sign breaks.
        return str.replace(/\/\/.*/g, '');
    }

    removeNewlines(str) {
        return str.replace(/\n/g, ' ');
    }
}
return { PolyPlayer: PolyPlayer, PolyPlayers: PolyPlayers }
})()
