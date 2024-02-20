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
