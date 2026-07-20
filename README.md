# Handout Ping Viewer

A lightweight, free module for Foundry VTT that turns the native **Image Popout** window into a real handout tool — perfect for showing letters, maps, photos, or clues to your players and letting everyone examine and point things out together.

System-agnostic. Works with any game system.

## Features

- **Pan & zoom** on any image opened in a popout — mouse wheel to zoom (centered on the cursor), click-and-drag to pan, double-click to reset the view.
- **Force View (GM only)** — broadcast your current zoom/position to every connected player looking at the same image, so everyone sees exactly what you're pointing at.
- **Collaborative ping** — anyone (GM or player) can click the image (without dragging) to drop an animated ping marker with their name, visible in real time to everyone who already has that same image open. Perfect for "look, right there!" moments during an investigation.

## How it works

This module hooks into Foundry's native image-sharing flow. Share an image with your players the way you already do (via a Journal Entry image, "Share Image", etc.) — as soon as the popout window opens, the pan/zoom/ping controls are available automatically. No extra setup, no need to pick images through a separate menu.

## Installation

1. In Foundry's **Setup** screen, go to **Add-on Modules → Install Module**.
2. Search for **Handout Ping Viewer**, or paste this manifest URL:
   `https://github.com/magisterphamtom/handout-ping-viewer/releases/latest/download/module.json`
3. Enable it in your world's module settings.

## Usage

- Open any image (journal image, shared image, etc.) — it opens in the standard Foundry Image Popout.
- **Scroll** to zoom, **click-drag** to pan, **double-click** to reset.
- **Click** anywhere on the image (without dragging) to drop a ping — everyone else currently viewing that image sees it appear with your name.
- If you're the GM, use the broadcast-tower button in the toolbar to force your exact view (zoom + position) onto every player who has the image open — or open it for them if they don't yet.

## Compatibility

Verified for Foundry VTT v13 and v14. System-agnostic.

## Development note

This module's concept, direction, and testing were driven by the author; the code and documentation were generated with the assistance of Claude (Anthropic).

## License

Released under the [MIT License](LICENSE).
