<a href="https://RockingShip.github.io/jsFractalZoom/jsFractalZoom.html?x=-0.8665722560433728&y=0.2308933773688535&r=3.021785750590329e-7&a=0&density=0.0362&iter=10080&theme=6&seed=2140484823" target="_blank"><img src="assets/favimage-840x472.jpg" width="100%" alt="favimage"/></a>

# Welcome to the wonderful world of (fractal) zooming.

When insufficient resources force you to prioritize which pixels to render first...

This project has 3 Components:

- XaoS inspired fractals as sample content.
- The `zoomer` engine.
- The `splash` video codec.

## Experience the fractal zoomer

Click on the image above to start the zoomer at the presented location.

Suggestions for the best experience:

- Enable full-screen. If the browser gives too much of a hassle, there is a button in the top right corner.
- Fly around to nice places
- Too much noise, with the wheel you can adjust focus like a microscope.
- Found a nice spot, staying put enables turbo mode for maximum calculations.
- Rendering is complete when "quality" (top status line in menu) reaches "1".
- Menu has many goodies. The control panel can be resized.
- Panel buttons "save" to save PNG or "url" to copy weblink to clipboard.

For desktop (primary design target):

- `ctrl+` / `ctrl-`: change display resolution. For highest quality match this to your screen.
- Mouse left: zoom in
- Mouse right: zoom out
- Wheel pressed: drag
- Wheel turn: focus

Touch screen:

- 1-finger: drag
- 2-fingers: navigation. You can release one finger afterwards.
- 3-fingers: focus. You can release two fingers. Then with your second finger use the screen like it being a wheel.

### A Pixel is not a Pixel

The CSS standard has sadly botched the meaning of DPI by fixating it to being 96.  
To make matters worse, browser builders botched it further (especially on mobile) by differentiating between CSS and Physical pixels.  
Even the latter is not always what it seems.

The fractal zoomer displays a popup when it detects screen resolution changes.  
For maximum quality the resolution should match that of your display.

On desktop, you can change the resolution by `ctrl+` and `ctrl-`.  
Mobile starts with CSS pixels which could be as low as 560x360, this to save battery.  
To switch to physical pixels, toggle the `HiRes` button on the control panel.

For more information visit the side project: [https://github.com/xyzzy/realDPI](https://github.com/xyzzy/realDPI)

# Background

`jsFractalZoom` is an fractal generator/zoomer written in javascript. It was inspired by XaoS, [https://xaos.sourceforge.net/black/index.php](https://xaos.sourceforge.net/black/index.php).

The project was originally created in May 2011, resurrected in 2018 and extended in 2020.

The 2020 version is canvas based. The 2018 engine created GIF images using an ultra fast GIF encoder [https://github.com/xyzzy/jsGifEncoder](https://github.com/xyzzy/jsGifEncoder).
 
## Demos

There are 3 demos. All are work-in-progress and may not work in any/all situations.

[jsFractalZoom-formula.html](https://RockingShip.github.io/jsFractalZoom/jsFractalZoom-formula.html)
The original with most of the formula's working.

[jsFractalZoom-navigation.html](https://RockingShip.github.io/jsFractalZoom/jsFractalZoom-navigation.html)
The original with most of the navigation working.

[jsFractalZoom.html](https://RockingShip.github.io/jsFractalZoom/jsFractalZoom.html)
The current unification and completion.

## Versioning

This project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html). 
For the versions available, see the [tags on this repository](https://github.com/xyzzy/jsFractalZoom/tags).

## License

This project is licensed under Affero GPLv3 - see the [LICENSE](LICENSE) file for details.
