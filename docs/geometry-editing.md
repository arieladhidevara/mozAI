# Simplified Base + Object-Aware AI Edit (November 2026)

## Workflow
1. Start with ONE uploaded Base image. Choose Generate Master or Use Base. Master upload is no longer displayed as a second onboarding choice.
2. The navigation bar presents an icon-only Pointer beside Pan.
3. Auto Select is always enabled: rectangle, ellipse, lasso and Wand use meaningful overlap with **live** object masks. The explicit toggle is removed.
4. The Sources panel and Markup controls are hidden from the editor, while internal legacy data and import/export compatibility are retained.
5. Full-image **AI Edit** analyzes the prompt before image generation using the new authenticated scene-intent endpoint. For "change all tables to red", it maps the noun **table** to candidate Object Map IDs, checks those objects with SAM 3 semantic segmentation, verifies mask overlap, selects the confirmed objects and assigns them to a Tables collection.
6. AI Edit then generates a full RGB result and runs SAM 3 automatic segmentation once more, matching detected instances to existing Object IDs by spatial evidence. Each object gets its own option under **AI Edit 1**, **AI Edit 2**, and so on.
7. Harmonize follows the same per-object versioning pipeline, using **Harmonize 1**, **Harmonize 2**, etc. Existing alternatives are retained. Unmatched instances explicitly use the previous mask with a fallback status rather than pretending a confident match.
8. All version counters, patch masks, source images, histories and generated-category metadata are stored in the existing local .moz file, without project persistence in Supabase.

## Limits and verification
- SAM 3's automatic region proposal is best effort, not exhaustive. Failed or unconfirmed matches retain their prior masks and are marked as such.
- Scene-targeting requires an Object Map with semantic IDs, a connected OpenAI key and the configured SAM 3 Space.
- Strong homography / independent camera calibration is still not implemented. The shape editor continues to rely on the protected overlay and small translation alignment.
- CI covers contracts, syntax, backend intent filtering, overlap selection, and masking regressions. Live visual end-to-end verification against a configured OpenAI + SAM 3 setup is still needed.

---

# Object-aware Shape / Remove editing (initial implementation)

This extends the current mozAI editor without Supabase project storage or a second generative Object-ID render.

## Interaction
- Select a single recognized object, then choose Material (existing cropped edit) or Shape in the floating prompt bar.
- Existing + image reference, drag/paste, Merge Objects and Add to Group remain available.
- Shape uses one full-frame RGB image generation, then the existing SAM segment_object endpoint for the new silhouette.
- Remove uses the selected object's old mask and generates revealed RGB behind it.
- Both operations show a review preview before committing; Discard leaves the project unchanged.

## Non-destructive scene data
- Geometry edits create new Options in the selected Group. Previous Options remain available.
- Compositing covers the union of the old and new silhouette, including newly revealed background.
- A separate geometryObjectMask stores the new object outline.
- Newly exposed pixels and provenance are retained in state.objectReconstruction.events.
- Nearby existing surfaces matched through SAM gain progressive texture/coverage entries, with tentative occlusion evidence.
- Unresolved ownership is unassigned rather than guessed.
- Existing local .moz Save/Open serializes scene metadata and canvases. The existing format is JSON-based, not a ZIP yet. No API keys are stored.

## Alignment and safeguards
- Unselected regions are protected by compositing from the original scene.
- Lightweight image-gradient translation alignment corrects small consistent offsets. If inconclusive, original image coordinates are retained.
- Full ORB/RANSAC homography and independent local geometry correction are not implemented yet.
- Implausible/missing SAM masks fail safely before Apply.
- Revealed pixels are AI-estimated, not guaranteed physical geometry.

## Known limits / next milestones
1. Add calibrated OpenCV homography with robust feature matching excluding edited masks.
2. Extend stable object matching for multiple moved, split, merged or visually identical objects.
3. Add stronger background ownership and confidence review for wall/floor/ceiling.
4. Upgrade .moz to ZIP-based assets and add IndexedDB crash recovery.
5. Add browser end-to-end tests with a configured SAM endpoint and architectural interior pairs.

SAM inference and OpenAI image generation still require their configured services. Project storage does not require Supabase.


## Object removal and manual ownership

Remove on an original object uses the regional Edit crop and alpha mask. The
snapshot omits overlapping created foreground objects; those layers remain in
the displayed scene. Create cutouts still remove instantly without a model call.
The Groups remove action uses the same reversible visual removal.

After the image edit is accepted, the previous object becomes a selectable
**Removed** region. Remove does not request SAM, infer labels, discover objects,
or extend neighboring objects automatically. The reconstruction keeps the
original mask as its unclaimed area.

To assign pixels, select an existing object, choose a dashed Select tool with
Add, and draw the desired portion of Removed. Only the intersection with the
unclaimed area transfers to that object. The remaining pixels stay Removed.
Appending the whole Removed object (Ctrl/Add) claims all remaining pixels.
Ownership changes preserve RGB and do not generate another image. Future
material edits use the owner's extended mask.

Original / Removed switching withdraws and restores the dependent claims. Undo /
Redo restores both masks together. The reconstruction, remaining mask, and
manual assignments persist in `.moz`. Legacy version-2 ownership records remain
readable; new removals use version 3 with manual ownership. Shape continues to
use its existing SAM geometry workflow.

`tests/removed-manual-scenarios.js` exercises the image-edit request, exact Select
Add geometry, pixel preservation, later material editing, history and project
round-trip. Provider responses are simulated and any SAM or reveal-label request
in the manual Remove flow fails the scenario. Historical automatic-ownership
scenarios remain in `tests/remove-reconstruction-scenarios.js`.
