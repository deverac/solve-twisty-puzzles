// Port of Josef Jelinek's Rubik's Cube Image generator.
// https://ruwix.com/the-rubiks-cube/rubiks-cube-image-generator-icube-picube-josef-jelinek-and-gilles-roux-php-code/

// Url parameters:
// fl: specify the color pattern of the cube. Only three faces of the cube are visible so
//     in the case of a 3x3x3 cube you have to specify one-by-one the colors of 27 fields
//     beginning from the top layer upper corner:
//        grey (x), green (g), pink (p), yellow (y), orange (o), blue (b), white (w), etc.
// bg: sets the hex code of the background color. The default is white (FFFFFF)
// size: The default size is 100x100 but you can make your image smaller or bigger with this parameter
// n: You can display any NxNxN cube, the default is 3x3x3.
// m: Sets the view angle of the cube. It can be x,y,xy.
// f: set the format of the Rubik's Cube: .gif(dithered), .png, .jpeg, .jpg(blurs the image)
// b: Stickers border width (0..200), the default is 25
// d: The distance between the stickers and the cube body. (0.100), the default is 5

// 'f' is ignored.
// min() is ignored
// missing colors default to 'x' (gray)
// Original instructions did not include all colors: robgwyldxkcpm
// Used a smaller default size. 100 -> 50

// function getImgParams(url) {
//      var qry = paramStr.split("?");
//      return parseParams(qry[1]);
// }
function parseParams(paramStr) {
     var dct = {};
     var vars = paramStr.split("&");
     for (var i=0; i<vars.length; i++) {
         var kv = vars[i].split("=");
         dct[kv[0]] = kv[1];
     }
     return dct;
}

function hexColor(n) {
    if (!n) {
      n = 0x999999;
    }
    var s = n.toString(16);
    var len = 6;
    if (s.length <= 3) {
      len = 3;
    }
    while (s.length < len) {
        s = "0" + s;
    }
    return s;
}

// Shim functions PHP functions
function imagecreatetruecolor(cvs, dim) {
    cvs.setAttribute("width", dim);
    cvs.setAttribute("height", dim);
   return cvs.getContext('2d');

}
function imagefilledrectangle(im, x,y, w,h, bg) {
    im.fillStyle = "#" + hexColor(bg);
    im.fillRect(x,y, w, h);
}
function imagefilledpolygon(im, ary, n, c) {
    im.fillStyle = "#" + hexColor(c);
    im.beginPath();
    im.moveTo(ary[0], ary[1]);
    for (var i=2; i<n*2; i+=2) {
        im.lineTo(ary[i], ary[i+1]);
    }
    im.closePath();
    im.fill();
}
function isset(val) { return (val ? true : false);}
function hexdec(v) {return Number("0x" + v);}
function min(a, b) {return Math.min(a, b);}
function sin(v) {return Math.sin(v);}
function cos(v) {return Math.cos(v);}
function substr(s, offs, len) {return s.substr(offs, len);}

function jjcube() {
    var eles = document.querySelectorAll("img.cube");
    for (var i=0; i< eles.length; i++) {
        var src = eles[i].dataset.src ? eles[i].dataset.src : eles[i].src;
        if (src) {
            var ss = src.split("?");
            var qry = (ss.length < 2 ? "" : ss[1]);
            var canvas = document.createElement("canvas");
            drawCube(canvas, qry);
            var dataURL = canvas.toDataURL("image/png");
            eles[i].src = dataURL;
        }
    }
}

if (window) {
    window.addEventListener('load', jjcube);
}



function rotu(u,v,a) { return u*cos(a) - v*sin(a); }
function rotv(u,v,a) { return u*sin(a) + v*cos(a); }
function rotxy(x,y,z,ex,ey,ez,ax,ay) {
 ry = rotu(ey,ez,ax);
 rz = rotv(ey,ez,ax);
 rx = rotu(ex,rz,ay);
 rz = rotv(ex,rz,ay);
 return x*rx + y*ry + z*rz;
}
function projxy(x,y,z,ex,ey,ax,ay,m) {
 xx = m == 2 ? z : x;
 yy = m == 0 ? z : y;
 zz = m == 0 ? -y : (m == 2 ? x : z);
 return rotxy(xx,yy,zz,ex,ey,0,ax,ay) / (1.0 - 0.3 * rotxy(xx,yy,zz,0,0,-1,ax,ay));
}
function outcoordx(x,m) { return m > 0 ? x * 0.58 + 0.52 : x * -0.58 + 0.48; }
function outcoordy(y,m) { return m > 0 ? y * 0.58 + 0.46 : y * -0.58 + 0.54; }

function tile(im,r, x0,y0, x1,y1, x2,y2, x3,y3, z, ax, ay, c, m, mx, my) {
 xx0 = outcoordx(projxy(x0,y0,z,1,0,ax,ay,m), mx) * r;
 yy0 = outcoordy(projxy(x0,y0,z,0,1,ax,ay,m), my) * r;
 xx1 = outcoordx(projxy(x1,y1,z,1,0,ax,ay,m), mx) * r;
 yy1 = outcoordy(projxy(x1,y1,z,0,1,ax,ay,m), my) * r;
 xx2 = outcoordx(projxy(x2,y2,z,1,0,ax,ay,m), mx) * r;
 yy2 = outcoordy(projxy(x2,y2,z,0,1,ax,ay,m), my) * r;
 xx3 = outcoordx(projxy(x3,y3,z,1,0,ax,ay,m), mx) * r;
 yy3 = outcoordy(projxy(x3,y3,z,0,1,ax,ay,m), my) * r;
 imagefilledpolygon(im, [xx0,yy0, xx1,yy1, xx2,yy2, xx3,yy3], 4, c);
}
function square(im,r, x,y, w, b, z, m, c, mx, my) {
 tile(im,r, x+b-0.5,y+b-0.5, x+w-b-0.5,y+b-0.5, x+w-b-0.5,y+w-b-0.5, x+b-0.5,y+w-b-0.5, z, -0.5, 0.6, c, m, mx, my);
}


  function drawCube(cvs, parmStr) {
    var _GET = parseParams(parmStr);
     _GET['stickers'] = ''; // Avoid error if 'fl' is not set.


    side = isset(_GET['n']) ? 1 * _GET['n'] : 3;
    // size = isset(_GET['size']) ? _GET['size'] : 100;
    size = isset(_GET['size']) ? _GET['size'] : 50;
    b = isset(_GET['b']) ? _GET['b'] : 25;
    d = isset(_GET['d']) ? _GET['d'] : 5;
    //dim = min(5 * size, 500); // Disabled min() check.
    dim = min(5 * size, Number.MAX_VALUE); // Disable min() check..
    fl = isset(_GET['fl']) ? _GET['fl'] : _GET['stickers'];
    bg = isset(_GET['bg']) ? hexdec(_GET['bg']) : 0xFFFFFF;
    c = { 'r': 0xD00000, 'o': 0xEE8800, 'b': 0x2040D0, 'g': 0x11AA00, 'w': 0xFFFFFF, 'y': 0xFFFF00, 'l': 0xDDDDDD, 'd': 0x555555, 'x': 0x999999, 'k': 0x111111, 'c': 0x0099FF, 'p': 0xFF99CC, 'm': 0xFF0099};
    mx = isset(_GET['m']) ? (_GET['m'] == 'x' || _GET['m'] == 'xy' ? -1 : 1) : 1;
    my = isset(_GET['m']) ? (_GET['m'] == 'y' || _GET['m'] == 'xy' ? -1 : 1) : 1;
     
    im = imagecreatetruecolor(cvs, dim);
    imagefilledrectangle(im, 0,0, dim-1,dim-1, bg);

    square(im,dim, 0,0, 1, 0, -0.5, 0, 0x010101, mx, my); // U
    square(im,dim, 0,0, 1, 0, -0.5, 1, 0x090909, mx, my); // F
    square(im,dim, 0,0, 1, 0,  0.5, 2, 0x050505, mx, my); // R
    for (m = 0; m < 3; m++)
     for (i = 0; i < side; i++)
      for (j = 0; j < side; j++)
       square(im,dim, j/(1.0*side),i/(1.0*side), 1.0/side, b/1000.0, m < 2 ? -0.5-d/1000.0 : 0.5+d/1000.0, m, c[substr(fl,m*side*side+i*side+j,1)], mx, my);

  }

