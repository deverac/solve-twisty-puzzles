class PolyPlayer extends PolyPlayerImpl {

    constructor(config, cvs, rearCvs, ctls, initB, playB, nextB, prevB, pauseB, pngB, infoE, anchE) {

        super(ConfigParser.parse(config),
              new Canvas(cvs, false),
              new Canvas(rearCvs, true),
              new Controls(ctls),
              new Button(initB),
              new Button(playB),
              new Button(nextB),
              new Button(prevB),
              new Button(pauseB),
              new Button(pngB),
              new Text(infoE),
              new Anchor(anchE)
        );
    }

    loadConfig(cfg) {
        super.reinit(ConfigParser.parse(cfg));
    }

}