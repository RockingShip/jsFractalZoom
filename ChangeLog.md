# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Home gesture
- Palette
- Starting thumbnail
- makeRuler() error weights
- renderLines() neighbor spreading

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

[Unreleased]: https://github.com/xyzzy/jsFractalZoom/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/xyzzy/jsFractalZoom/compare/v0.1.0...v0.2.0
