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
