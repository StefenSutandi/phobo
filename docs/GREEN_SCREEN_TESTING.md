# Green Screen Testing Guide

This guide covers testing and tuning the chroma key pipeline for Phobo.

## Physical Setup Checklist
- [ ] Green screen must be flat
- [ ] Lighting should be even
- [ ] Subject should not stand too close to green screen
- [ ] Avoid green clothing
- [ ] Lock exposure/white balance if possible

## Software Tuning Guide
You can adjust these settings in the Admin Dashboard:
- `applyChromaKey`: Toggle whether chroma key is active.
- `greenMin`: The minimum green channel value considered as background (0-255).
- `greenTolerance`: The tolerance for how dominant green must be over red/blue (0-255).
- `spillReduction`: (Experimental) Reduces green spill on subject edges (0-100).
- `edgeSoftness`: (Experimental) Softens the edges of the removed background (0-20).

## Symptoms and Fixes
- **Green remains in background**: lower `greenMin` or increase `greenTolerance`
- **Subject is erased**: increase `greenMin` or decrease `greenTolerance`
- **Edges look green**: tune `greenTolerance` / `spillReduction`
- **Shadows remain**: improve lighting first

## Pass/Fail Criteria
- Background mostly removed
- Subject body intact
- Edges acceptable for MVP
- `final_screen.png` and `final_print.jpg` generated successfully

## Known Limitations
- MVP chroma key is not AI segmentation.
- Lighting quality matters more than code tuning.
