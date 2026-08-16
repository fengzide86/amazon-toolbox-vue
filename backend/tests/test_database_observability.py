"""Database timing metadata must stay useful without exposing query values."""

from database import sql_fingerprint


def test_sql_fingerprint_is_stable_for_whitespace() -> None:
    operation, compact = sql_fingerprint("SELECT  *\nFROM users WHERE id = ?")
    _, spaced = sql_fingerprint("  SELECT * FROM users   WHERE id = ?  ")

    assert operation == "SELECT"
    assert compact == spaced
    assert len(compact) == 16


def test_sql_fingerprint_does_not_return_statement_text() -> None:
    statement = "UPDATE users SET phone = ? WHERE id = ?"
    operation, fingerprint = sql_fingerprint(statement)

    assert operation == "UPDATE"
    assert statement not in fingerprint
    assert "users" not in fingerprint
