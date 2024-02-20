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