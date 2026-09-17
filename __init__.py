"""Session Styler — agent half.

The plugin is a **desktop** plugin: it styles the Hermes Desktop session list (per-conversation
icons, status marks, colors, sizes) and keeps its settings in the profile's ``ui_meta`` so another
machine restores them. Nothing of it runs in the agent, so this half contributes **no tools, no
hooks, no middleware** and reads no environment variables — it exists because a Hermes package needs
an importable module beside its manifest.

See ``desktop/plugin.js`` for the whole implementation, and ``plugin.yaml`` for the declared
capabilities.
"""

from __future__ import annotations


def register(ctx) -> None:
    """Register nothing: the plugin's capabilities live entirely in the desktop half."""
    return None
