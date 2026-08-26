from pathlib import Path

path = Path(__file__).with_name("refactor_users.py")
text = path.read_text(encoding="utf-8")
text = text.replace(
    '    new_render + "\\n\\nfunction marketingProgressFor",',
    '    lambda _match: new_render + "\\n\\nfunction marketingProgressFor",',
)
text = text.replace(
    '    new_editor + "\\n\\nasync function updateUserProfile",',
    '    lambda _match: new_editor + "\\n\\nasync function updateUserProfile",',
)
path.write_text(text, encoding="utf-8")
Path(__file__).unlink()
