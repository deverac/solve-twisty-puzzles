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
