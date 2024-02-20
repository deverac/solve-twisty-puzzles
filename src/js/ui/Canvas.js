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
