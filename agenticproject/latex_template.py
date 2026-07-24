"""Block state -> compiled LaTeX resume.

Reuses the exact macro skeleton from Julien's own MyExp/resume.tex (the
resume he actually uses for real applications) so tailored output has
identical visual structure -- not a jsPDF approximation of it.
"""

import re
from typing import Any, Dict, List

# Order matters: backslash first, or later replacements would themselves
# get escaped a second time.
_LATEX_SPECIAL_CHARS = [
    ("\\", r"\textbackslash{}"),
    ("&", r"\&"),
    ("%", r"\%"),
    ("$", r"\$"),
    ("#", r"\#"),
    ("_", r"\_"),
    ("{", r"\{"),
    ("}", r"\}"),
    ("~", r"\textasciitilde{}"),
    ("^", r"\textasciicircum{}"),
]


def escape_latex(text: str) -> str:
    """Escape LaTeX special characters in LLM-generated text.

    LLM bullets routinely contain '%' (e.g. "cut triage 77%") and '&'
    (e.g. "R&D") -- both LaTeX special characters. Without this, compilation
    breaks on nearly every achievement-style bullet. Bold markdown (**x**)
    is converted to \\textbf{} before escaping so the ** markers don't get
    mangled by the escape pass.
    """
    if not text:
        return ""

    # Convert markdown bold to \textbf{} first (on the raw text, before
    # escaping mangles the ** markers), then escape everything else.
    parts = re.split(r"(\*\*[^*]+\*\*)", text)
    escaped_parts = []
    for part in parts:
        bold_match = re.match(r"^\*\*(.+)\*\*$", part)
        if bold_match:
            inner = bold_match.group(1)
            escaped_parts.append(f"\\textbf{{{_escape_raw(inner)}}}")
        else:
            escaped_parts.append(_escape_raw(part))
    return "".join(escaped_parts)


def _escape_raw(text: str) -> str:
    for char, replacement in _LATEX_SPECIAL_CHARS:
        text = text.replace(char, replacement)
    return text


def _resume_item(text: str) -> str:
    return f"      \\resumeItem{{{escape_latex(text)}}}"


def _entry_to_tex(entry: Dict[str, Any]) -> str:
    """One \\resumeSubheading block -- an experience entry with its
    (tailored) bullets."""
    title = escape_latex(entry.get("title", ""))
    company = escape_latex(entry.get("company", ""))
    dates = escape_latex(entry.get("dates", ""))
    location = escape_latex(entry.get("location", ""))
    bullets = entry.get("blocks", [])

    bullet_lines = "\n".join(_resume_item(b["chosen"]) for b in bullets if b.get("chosen"))

    return (
        "  \\resumeSubheading\n"
        f"    {{{title}}}{{{dates}}}\n"
        f"    {{{company}}}{{{location}}}\n"
        "    \\resumeItemListStart\n"
        f"{bullet_lines}\n"
        "    \\resumeItemListEnd"
    )


def _other_section_to_tex(section: Dict[str, str]) -> str:
    """Generic passthrough renderer for sections not covered by the block
    pipeline (Skills, Education, Certifications, etc.) -- one bullet per
    non-empty line, escaped. Not macro-matched to resume.tex's
    section-specific formatting (tabular headers for Education, etc.) --
    that's a follow-up polish item, not required for a correct compile."""
    title = escape_latex(section["title"])
    lines = [ln.strip() for ln in section["content"].split("\n") if ln.strip()]
    if not lines:
        return f"\\section{{{title}}}"
    items = "\n".join(f"  \\item \\small {escape_latex(ln)}" for ln in lines)
    return (
        f"\\section{{{title}}}\n"
        "\\begin{itemize}[leftmargin=0.15in, itemsep=0pt, topsep=0pt]\n"
        f"{items}\n"
        "\\end{itemize}"
    )


_PREAMBLE = r"""\documentclass[letterpaper,11pt]{article}
\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\usepackage{comment}
\usepackage[hidelinks]{hyperref}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1in}

\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{
  \vspace{-10pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-10pt}]

\newcommand{\resumeItem}[1]{\item\small{#1}}

\newcommand{\resumeSubheading}[4]{%
  \vspace{0pt}\item
  \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
    \textbf{\normalsize #1} & \small #2 \\
    \textit{\small #3} & \textit{\small #4} \\
  \end{tabular*}\vspace{-4pt}%
}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}, itemsep=2pt, topsep=1pt]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}[leftmargin=0.2in, itemsep=0pt, topsep=1pt]}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-4pt}}
"""


def blocks_to_tex(
    header: Dict[str, str],
    summary: str,
    entries: List[Dict[str, Any]],
    other_sections: List[Dict[str, str]],
    linkedin_url: str = "",
    github_url: str = "",
    portfolio_url: str = "",
) -> str:
    """Assemble the full .tex document from block state.

    entries: [{id, title, company, dates, location,
               blocks: [{chosen, ...}, ...]}, ...]
    -- blocks carry whatever the frontend currently has selected/edited for
    that bullet (after alternate-cycling, drag-reorder, manual edits, or
    regeneration), NOT necessarily the original LLM "chosen" value.
    """
    name = escape_latex(header.get("name", "")) or "Your Name"
    email = escape_latex(header.get("email", ""))

    # No icon font (fontawesome5) -- confirmed live in a real Docker build
    # (2026-07-24) that tectonic crashes with a native "free(): invalid
    # pointer" while loading FontAwesome5Free-Solid-900.otf in this
    # container environment (isolated: every other package in this
    # preamble compiles cleanly, only fontawesome5 triggers it). Plain-text
    # labels trade a cosmetic icon for a PDF that actually renders.
    contact_parts = []
    if email:
        contact_parts.append(f"\\href{{mailto:{header.get('email', '')}}}{{{email}}}")
    if linkedin_url:
        contact_parts.append(f"\\href{{{linkedin_url}}}{{LinkedIn}}")
    if github_url:
        contact_parts.append(f"\\href{{{github_url}}}{{GitHub}}")
    if portfolio_url:
        contact_parts.append(f"\\href{{{portfolio_url}}}{{Portfolio}}")
    contact_line = " $|$\n    ".join(contact_parts)

    summary_block = ""
    if summary:
        summary_block = (
            "\\vspace{-12pt}\n"
            "\\begin{center}\n"
            f"\\small {escape_latex(summary)}\n"
            "\\end{center}\n"
        )

    entries_tex = "\n\n".join(_entry_to_tex(e) for e in entries)
    other_tex = "\n\n".join(_other_section_to_tex(s) for s in other_sections)

    doc = (
        _PREAMBLE
        + "\n\\begin{document}\n\n"
        + "\\begin{center}\n"
        + f"    \\textbf{{\\Large \\scshape {name}}} \\\\[2pt]\n"
        + "    \\small\n"
        + f"    {contact_line}\n"
        + "\\end{center}\n"
        + summary_block
        + "\n\\section{Experience}\n"
        + "\\resumeSubHeadingListStart\n\n"
        + entries_tex
        + "\n\n\\resumeSubHeadingListEnd\n\n"
        + other_tex
        + "\n\n\\end{document}\n"
    )
    return doc
