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
