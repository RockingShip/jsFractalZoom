# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

`Zoomer`, Isolate and extract core logic so it can be used within other projects

```
2020-10-15 11:52:17 Comments.
2020-10-14 23:18:53 Redesigned statistics.
2020-10-14 19:37:21 Moved many (but not all) references to `Config` from `zoomer.js`.
2020-10-14 01:24:32 Drop `requestAnimationFrame()`.
2020-10-14 01:05:20 Added `Zoomer.allocFrame()`.
2020-10-14 00:33:55 Moved many (but not all) references to `Config` from `zoomer.js`.
2020-10-13 01:24:20 Mostly comments and simple rewrites.
2020-10-12 23:21:50 `Zoomer`,`jsFractalZoom` Modernised `var` usage.
2020-10-12 22:59:42 `Zoomer` Modernised construction.
2020-10-12 14:24:27 Extract core logic into `zoomer.js`.
2020-10-12 14:21:12 Modernised `this` binding.
2020-10-12 13:23:57 Lowered and renamed `zoomSpeed`.
2020-10-12 13:23:57 Relocate related functions to `Zoomer`.
2020-10-12 13:10:23 Relocate related data members to `Zoomer`.
2020-10-12 10:50:54 Extract and relocate zoomer callbacks.
2020-10-12 09:27:04 Isolate resource handling.
2020-10-12 08:25:33 Renaming and refactoring.
2020-10-12 07:38:22 Canvas size fix. Initial random palette.
2020-10-12 07:37:14 Forking branch `zoomer`. Isolate and extract core logic so it can be used within other projects
```

## [0.8.0] 2018-03-06

### Added
- Formula, incolour, outcolour and plane

### Changed
- Config() static scoping
- Formula() static scoping
- Improved palette and pixel value 65535 for background
- Fast initial image

## [0.7.0] 2018-02-20

### Added
- Webworker for paint offloading (but with postMessage() disabled)

## Changed
- Improved update_pixels()
- Simplified palette

## [0.6.0] 2018-02-13

### Added
- Home gesture
- Palette
- Starting thumbnail
- `makeRuler()` error weights
- `renderLines()` neighbour spreading
- Autopilot
- Fullscreen mode

## Changed
- xyCoord[] calculation was causing out of sync.  
 
## [0.5.0] 2018-02-09

### Added
- Viewport mouse gestures
- Double viewports
- X/Y rulers

### Changed
- Relocate pixel data from GUI to newly created Viewport

## [0.4.0] 2018-02-05

### Changed
- High precision timers
- mainloop timings
- double imagedata buffer
- Optimize paint when not rotated

## [0.3.0] 2018-02-05

### Added
- RadioButton/RadioGroup
- JavaScript bindings
- Mainloop and GIF encoder
- Replaced GIF encoder with drawing pixels directly on canvas

### Changed
- Unified ARIA

## [0.2.0] 2018-02-03

### Added
- Redesigned user interface according to ARIA practices https://www.w3.org/TR/wai-aria-practices

## 0.1.0 2018-01-30

### Changed
- General cleanup
- Initial commit

## 0.0.0 2011-05-09

### Added
- Initial creation

[Unreleased]: https://github.com/xyzzy/jsFractalZoom/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.1.0...v0.2.0
