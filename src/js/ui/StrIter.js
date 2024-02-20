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
