# Changelog

All notable changes to this package will be documented in this file.

## [Unreleased]

### Added

- Added initial presentation package scaffold.
- Added source manifests for external教材/指导思想 PDFs and guidance extraction indexes for hidden teaching constraints.
- Added macOS Vision OCR fallback for scanned guidance PDFs without extractable text layers.
- Added music deck planning artifacts with full lesson context and storyboard output.
- Added PPT Master-style SVG project output with textbook page PNG assets and slide notes.
- Added basic SVG project QA reports for slide count, notes, assets, and forbidden student-facing terms.
- Added configurable PPT Master SVG-to-PPTX export adapter.
- Added the standalone `music-ppt` CLI for initializing, indexing, planning, rendering, and exporting primary music PPT projects.

### Changed

- Generalized the default storyboard so non-rain lessons no longer receive rain-specific slide text.
