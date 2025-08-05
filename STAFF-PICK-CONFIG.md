# Staff Pick Configuration Examples

This file shows different ways to configure the Staff Pick feature using `staff-pick-config.json`.

## Example 1: Default Staff Pick (Automatic Daily Selection)
```json
{
  "enabled": true,
  "auto_update": true,
  "picker_name": "Staff",
  "specific_library": null,
  "last_updated": "2025-08-04",
  "notes": "Default configuration - uses deterministic daily selection"
}
```

## Example 2: Guest Picker with Specific Library (Manual Override)
```json
{
  "enabled": true,
  "auto_update": false,
  "picker_name": "Alice Johnson",
  "specific_library": "FastLED",
  "last_updated": "2025-08-04",
  "notes": "Alice's pick for this week - highlighting the FastLED library"
}
```

## Example 3: Themed Pick (Manual Override)
```json
{
  "enabled": true,
  "auto_update": false,
  "picker_name": "IoT Expert",
  "specific_library": "ESP8266WiFi",
  "last_updated": "2025-08-04",
  "notes": "This week's theme: Internet of Things"
}
```

## Example 4: Disabled Staff Pick
```json
{
  "enabled": false,
  "auto_update": true,
  "picker_name": "Staff",
  "specific_library": null,
  "last_updated": "2025-08-04",
  "notes": "Staff Pick is temporarily disabled"
}
```

## Example 5: Re-enabling Auto-Updates After Manual Override
```json
{
  "enabled": true,
  "auto_update": true,
  "picker_name": "Staff",
  "specific_library": null,
  "last_updated": "2025-08-04",
  "notes": "Returning to automatic daily selection"
}
```

## Configuration Fields:

- **enabled**: `true` to show the Staff Pick section, `false` to hide it completely
- **auto_update**: `true` to allow workflows to automatically update the pick daily, `false` to preserve manual selections
- **picker_name**: The name displayed (e.g., "Staff", "John Doe", "Arduino Expert", etc.)
- **specific_library**: Library name to feature, or `null` for automatic selection
- **last_updated**: When this configuration was last changed (for your reference)
- **notes**: Optional notes about the current configuration

## How Auto-Update Works:

- When `auto_update` is `true`: The daily and weekly workflows will automatically select new libraries
- When `auto_update` is `false`: The workflows will preserve your manually set `specific_library` and `picker_name`
- To manually override: Set `auto_update` to `false`, then specify your `specific_library` and `picker_name`
- To resume automatic updates: Set `auto_update` back to `true`

## Tips:

1. The `specific_library` field should match the exact library name as it appears in the system
2. If a specific library isn't found, it will fall back to automatic selection
3. Use themed picker names like "Security Expert", "Robotics Specialist", etc.
4. The configuration is loaded fresh each time the page loads
