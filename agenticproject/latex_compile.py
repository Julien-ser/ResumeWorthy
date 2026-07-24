"""Compile a .tex source string to PDF bytes.

Production target is Tectonic (a single static LaTeX binary, ~300MB, no
TeX Live install -- runs in a Render/Fly/Railway container per
DEPLOYMENT.md; MiKTeX is Windows-only and irrelevant to where this backend
actually deploys). Falls back to pdflatex if tectonic isn't on PATH, purely
so this is testable on a local Windows dev machine with MiKTeX installed
and no Docker -- the Dockerfile pins tectonic explicitly for prod, so
production never silently falls back to a missing engine.
"""

import asyncio
import os
import shutil
import tempfile
from pathlib import Path


class LatexCompileError(RuntimeError):
    def __init__(self, engine: str, stdout: str, stderr: str):
        self.engine = engine
        self.stdout = stdout
        self.stderr = stderr
        tail = (stdout or stderr)[-1500:]
        super().__init__(f"{engine} failed to compile:\n{tail}")


def _find_engine() -> str:
    if shutil.which("tectonic"):
        return "tectonic"
    if shutil.which("pdflatex"):
        return "pdflatex"
    raise RuntimeError(
        "No LaTeX engine found on PATH (tried tectonic, pdflatex). "
        "Production images must install tectonic; for local dev, install "
        "MiKTeX/TeX Live or add tectonic to PATH."
    )


async def compile_tex_to_pdf(tex_source: str, timeout: float = 30.0) -> bytes:
    engine = _find_engine()

    with tempfile.TemporaryDirectory(prefix="resumeworthy-tex-") as tmpdir:
        tex_path = Path(tmpdir) / "resume.tex"
        pdf_path = Path(tmpdir) / "resume.pdf"
        tex_path.write_text(tex_source, encoding="utf-8")

        if engine == "tectonic":
            args = ["tectonic", "--outdir", tmpdir, str(tex_path)]
        else:
            args = [
                "pdflatex", "-interaction=nonstopmode", "-halt-on-error",
                "-output-directory", tmpdir, str(tex_path),
            ]

        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=tmpdir,
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise LatexCompileError(engine, "", f"Compile timed out after {timeout}s")

        stdout = stdout_bytes.decode("utf-8", errors="ignore")
        stderr = stderr_bytes.decode("utf-8", errors="ignore")

        if proc.returncode != 0 or not pdf_path.exists():
            raise LatexCompileError(engine, stdout, stderr)

        return pdf_path.read_bytes()
