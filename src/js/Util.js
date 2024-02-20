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
