class Anchor extends Element {

  sendDownload(data, filename) {
    if (this.elem) {
        this.elem.download = filename || 'image.png';
        this.elem.href = data;
        this.elem.click();
    }
  }
}
