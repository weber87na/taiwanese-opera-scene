# Local Hanzi stroke-order medians

Official source: [chanind/hanzi-writer-data](https://github.com/chanind/hanzi-writer-data), pinned npm package [hanzi-writer-data@2.0.1](https://registry.npmjs.org/hanzi-writer-data/2.0.1). The upstream data derive from [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) and Arphic fonts.

Modified 2026-10-29: retained original stroke-order medians and coordinates only; removed outlines and other fields; regrouped hanzi-writer-data@2.0.1 into Unicode high-byte shards and a default-text subset. Copyright (C) 1999 Arphic Technology Co., Ltd. These derived data remain under the ARPHIC PUBLIC LICENSE; see ARPHICPL.TXT and SOURCE.md.

The original license is preserved byte-for-byte in ARPHICPL.TXT. No warranty is provided. These data and the conversion are available under the same ARPHIC PUBLIC LICENSE. The application code is separate from these data.

## Conversion

The archive was verified against both npm SHA-1 and SHA-512 integrity values. Only character JSON files were parsed. No downloaded package code was installed or executed. The unmodified medians retain the source stroke order and numeric coordinates; SVG outline paths and all other per-character fields were omitted. All 9574 characters from the published archive are included in 99 shards, with 112617 strokes and 629258 median points.

Each shard is a direct map of character to {medians: [[[x,y], ...], ...]}; its _notice entry is metadata, not a character. The shard for a character is computed as 'u' + Math.floor(character.codePointAt(0) / 256).toString(16).padStart(2, '0') + '.json'. For example, 一 is in u4e.json. No network dependency is needed at runtime.

Load defaults.json first for the current 55 configured characters, then request only missing characters' shards when content changes. defaults.json is only a cache, not a coverage limit. Characters absent from the upstream package should use the application's fallback. index.json lists exact coverage counts, sizes, and coordinate bounds. Coordinates are y-up in a nominal 1024-unit em, from y=-124 to y=900; for a top-down canvas use canvasY = (900 - y) * scale.

The preserved archive, npm metadata, upstream README, and reproducible data-only converter are in sources/hanzi-writer-data-2.0.1/. To rebuild from the preserved archive, run node sources/hanzi-writer-data-2.0.1/build-median-shards.mjs from the project folder. No package installation is needed.

SHA-1: 09ce12eb1c47d86aeb33313e622f17ba5cbac1ad

SHA-512 integrity: sha512-nbQwM+MaryGoq7pBMIZLCd3lFq03nXuJuwku1+6UbjL58uU+9OULVcMkoNvNuJSoIV7f1bbPRfD4D/LQa5S7qg==
