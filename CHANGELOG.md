# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

```
2020-12-02 02:19:26 Fixed: `wheel` event and canvas parent.
2020-12-02 01:39:22 Renamed: `error` into `score`.
2020-12-02 01:36:01 Added: `Rotate` button.
2020-12-02 00:56:30 Added: `HiRes` button.
2020-12-02 00:00:41 Changed: Relocated `devicePixelRatio` and resizing out of `zoomer`.
2020-12-01 23:51:31 Changed: Renewed dataset for `viewer.html`.
2020-12-01 01:23:28 Changed: `README.md`.
2020-12-01 01:22:18 Added: `select-ade.html`.
2020-11-29 22:13:56 Added: `select-gta.html`.
```

## 2020-11-21 20:02:58 [Version 0.10.0]

- Touch gestures.
- Better UX/UI.
- Video codec.

```
2020-11-21 17:57:24 Added. `devicePixelRatio`.
2020-11-21 16:02:38 Changed. Lost+Found.
2020-11-21 15:59:32 Added. Gesture states and palette density (3-finger) gesture.
2020-11-21 15:51:03 Changed. Smoother popup.
2020-11-20 01:17:11 Added. 2-touch to 1-touch gesture. 
2020-11-20 01:09:37 Changed. Consistent use `zoomAccel` and `zoomSpeed`.
2020-11-19 22:45:46 Added. Enumerate gestures.
2020-11-19 21:14:37 Changed. Relocate GUI prototypes to function. Only critical code changes.
2020-11-19 19:13:32 Changed. Autopilot marker and framerate.
2020-11-19 19:11:58 Changed. Control panel layout.
2020-11-19 18:58:42 Fixed palette size+outcolour.
2020-11-19 18:51:57 Simplified `Zoomer.options`.
2020-11-17 11:38:19 Don't start with monochrome theme.
2020-11-17 11:37:11 Popup shrink to fit while active.
2020-11-17 01:39:24 Added `gebi()` as short for `gelElementById()`.
2020-11-17 01:32:55 Added `showPilot()/hidePilot()`.
2020-11-17 01:08:53 Touch gestures navigation.
2020-11-16 23:15:36 Unglitch initial frame and angle.
2020-11-16 21:45:17 Rename `idle` to `turbo` and improved.
2020-11-16 19:47:24 Added favicon and OpenGraph.
2020-11-16 19:42:18 Move zoomer conversion routines before constructor. No code change.
2020-11-14 23:37:49 Touch events for `idNav`.
2020-11-14 23:36:01 Disable shrink wrap when popup visible.
2020-11-14 13:58:08 Fixed autopilot.
2020-11-13 23:57:41 Project URL.
2020-11-13 23:47:50 Keyboard bindings.
2020-11-13 23:45:06 Added drag&drop to load navigation data.
2020-11-13 23:05:24 Added center popup.
2020-11-12 18:19:38 Count lost frames.
2020-11-12 18:15:44 Fixed navigation drift.
2020-11-12 17:12:32 Moved conversion routines to `Zoomer`.
2020-11-12 00:15:47 Inlined `resize.svg`.
2020-11-11 23:58:24 Added menu and fullscreen buttons.
2020-11-11 21:33:02 Improved hiding autopilot marker.
2020-11-10 14:22:43 Redraw sliders on layout changes.
2020-11-10 12:50:20 Added frame numbers for syncing.
2020-11-10 02:12:54 Resizable control pane.
2020-11-08 01:54:59 Wheel for FireFox.
2020-11-08 01:17:17 Activate angle overhead when actually rotating.
2020-11-08 00:31:03 Added `Theme` button.
2020-11-08 00:22:28 Added palette density.
2020-11-07 21:54:23 Logarithmic zoom speed slider.
2020-11-06 13:02:50 Code cleanup.
2020-11-06 01:50:49 Mark screen center when dragging.
2020-11-06 01:48:54 Sleep state when done calculating.
2020-11-06 01:46:45 Code cleanup.
2020-11-06 01:38:53 Added Save/Url button.
2020-11-06 01:23:30 One/Two state buttons and improved UI.
2020-11-05 03:49:58 Load/Save/View navigation data.
2020-11-05 03:19:30 Seedable PRNG, loadable palette themes.
2020-11-05 02:40:11 Modernized changelog and license.
2020-11-03 14:57:53 Add text and borders to `codec.js`.
2020-11-02 22:49:44 Added reference implementation `codec.js`.
2020-10-27 22:11:25 Renamed `Frame` -> `ZoomerFrame` and `Viewport` -> `zoomerView`.
2020-10-26 23:28:27 Correct site URL.
```

## 2020-10-26 22:32:53 [Version 0.9.0]

`Zoomer`, Isolate and extract core logic so it can be used within other projects.

- Auto-adjusting `maxIter`.
- Extra palette themes.
- Different zoom speed for autopilot and manual.
- Faster and more responsive.
- Throttles when overloaded.
- Redesigned statistics.

```
2020-10-26 21:22:55 Throttling worker overloading by skipping frames and lowering FPS.
2020-10-26 18:48:49 Lost+Found.
2020-10-26 18:23:53 Lower DOM dimensions to minimize rounding errors.
2020-10-26 17:34:34 Autopilot now sensitive to contrast.
2020-10-26 16:58:01 Isolated `pixelIJ`, `screenUV` and `coordXY`.
2020-10-24 23:23:19 Improved adaptive `maxIter`.
2020-10-24 22:54:07 Added `Palette.randomize_segments5()`.
2020-10-21 16:48:04 Self adapting fontsize `viewer`.
2020-10-21 16:48:04 Added lightweight `viewer`.
2020-10-21 14:36:02 Reformat. No code change.
2020-10-21 02:58:09 Added adapting maxIter.
2020-10-21 02:51:31 Additional colour palette.
2020-10-20 22:45:42 Better use of types arrays.
2020-10-20 22:38:12 Added `onInitFrame()` and `onUpdatePixel()`.
2020-10-17 21:21:01 Added `enableAngle`.
2020-10-17 20:11:24 Split diameter into pixelWidth/pixelHeight.
2020-10-17 13:36:41 Fixed palette corruption.
2020-10-17 08:07:20 Fixed zoomspeed with auto/manual switch.
2020-10-16 23:42:00 Different zoom speed for auto and manual.
2020-10-16 21:51:55 Fixed and tuned timing issues.
2020-10-15 22:06:03 Upgraded workflow of `mainloop`.
2020-10-15 12:13:59 Reordered states in `mainloop`.
2020-10-15 11:57:25 Use `ArrayBuffer.copyWithin()` as `memcpy()`.
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
```

## [Version 0.8.0] 2018-03-06

### Added
- Formula, incolour, outcolour and plane

### Changed
- Config() static scoping
- Formula() static scoping
- Improved palette and pixel value 65535 for background
- Fast initial image

## [Version 0.7.0] 2018-02-20

### Added
- Webworker for paint offloading (but with postMessage() disabled)

## Changed
- Improved update_pixels()
- Simplified palette

## [Version 0.6.0] 2018-02-13

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
 
## [Version 0.5.0] 2018-02-09

### Added
- Viewport mouse gestures
- Double viewports
- X/Y rulers

### Changed
- Relocate pixel data from GUI to newly created Viewport

## [Version 0.4.0] 2018-02-05

### Changed
- High precision timers
- mainloop timings
- double imagedata buffer
- Optimize paint when not rotated

## [Version 0.3.0] 2018-02-05

### Added
- RadioButton/RadioGroup
- JavaScript bindings
- Mainloop and GIF encoder
- Replaced GIF encoder with drawing pixels directly on canvas

### Changed
- Unified ARIA

## [Version 0.2.0] 2018-02-03

### Added
- Redesigned user interface according to ARIA practices https://www.w3.org/TR/wai-aria-practices

## 0.1.0 2018-01-30

### Changed
- General cleanup
- Initial commit

## 0.0.0 2011-05-09

### Added
- Initial creation

[Unreleased]: https://github.com/xyzzy/jsFractalZoom/compare/v0.10.0...HEAD
[Version 0.10.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.9.0...v0.10.0
[Version 0.9.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.8.0...v0.9.0
[Version 0.8.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.7.0...v0.8.0
[Version 0.7.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.6.0...v0.7.0
[Version 0.6.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.5.0...v0.6.0
[Version 0.5.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.4.0...v0.5.0
[Version 0.4.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.3.0...v0.4.0
[Version 0.3.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.2.0...v0.3.0
[Version 0.2.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.1.0...v0.2.0
