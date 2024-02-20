class Button extends Element {
  clickHandler(fn) {
    this.elem.addEventListener("click", fn);
  }
}
