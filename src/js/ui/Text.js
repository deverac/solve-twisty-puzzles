class Text extends Element {

  setText(txt){
    if (this.elem) {
        this.elem.innerText = txt;
    }
  }
}
