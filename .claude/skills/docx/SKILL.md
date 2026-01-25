---
name: docx
description: Create, edit, and analyze Word documents (.docx files). Use this skill when working with Word documents - for reading content, creating new documents, editing existing ones, or implementing tracked changes (redlining).
---

# DOCX creation, editing, and analysis

## Overview

A user may ask you to create, edit, or analyze the contents of a .docx file. A .docx file is essentially a ZIP archive containing XML files and other resources that you can read or edit. You have different tools and workflows available for different tasks.

## Workflow Decision Tree

### Reading/Analyzing Content

Use "Text extraction" or "Raw XML access" sections below

### Creating New Document

Use "Creating a new Word document" workflow

### Editing Existing Document

- **Your own document + simple changes**
  Use "Basic OOXML editing" workflow

- **Someone else's document**
  Use **"Redlining workflow"** (recommended default)

- **Legal, academic, business, or government docs**
  Use **"Redlining workflow"** (required)

## Reading and analyzing content

### Text extraction

If you just need to read the text contents of a document, you should convert the document to markdown using pandoc. Pandoc provides excellent support for preserving document structure and can show tracked changes:

```bash
# Convert document to markdown with tracked changes
pandoc --track-changes=all path-to-file.docx -o output.md
# Options: --track-changes=accept/reject/all
```

### Raw XML access

You need raw XML access for: comments, complex formatting, document structure, embedded media, and metadata. For any of these features, you'll need to unpack a document and read its raw XML contents.

#### Unpacking a file

```bash
unzip document.docx -d unpacked/
```

#### Key file structures

- `word/document.xml` - Main document contents
- `word/comments.xml` - Comments referenced in document.xml
- `word/media/` - Embedded images and media files
- Tracked changes use `<w:ins>` (insertions) and `<w:del>` (deletions) tags

## Creating a new Word document

When creating a new Word document from scratch, use **docx-js**, which allows you to create Word documents using JavaScript/TypeScript.

### Workflow

1. **MANDATORY - READ ENTIRE FILE**: Read `docx-js.md` in this skill directory completely from start to finish. **NEVER set any range limits when reading this file.** Read the full file content for detailed syntax, critical formatting rules, and best practices before proceeding with document creation.

2. Create a JavaScript/TypeScript file using Document, Paragraph, TextRun components

3. Export as .docx using Packer.toBuffer()

### Dependencies

Install if not available:
```bash
npm install docx
```

## Editing an existing Word document

When editing an existing Word document, you can manipulate the XML directly or use Python libraries.

### Workflow

1. **MANDATORY - READ ENTIRE FILE**: Read `ooxml.md` in this skill directory completely from start to finish. **NEVER set any range limits when reading this file.** Read the full file content for XML patterns and editing techniques.

2. Unpack the document:
```bash
unzip document.docx -d unpacked/
```

3. Edit the XML files directly or create a Python script

4. Pack the final document:
```bash
cd unpacked && zip -r ../output.docx . && cd ..
```

## Redlining workflow for document review

This workflow allows you to plan comprehensive tracked changes using markdown before implementing them in OOXML. **CRITICAL**: For complete tracked changes, you must implement ALL changes systematically.

**Batching Strategy**: Group related changes into batches of 3-10 changes. This makes debugging manageable while maintaining efficiency. Test each batch before moving to the next.

**Principle: Minimal, Precise Edits**
When implementing tracked changes, only mark text that actually changes. Repeating unchanged text makes edits harder to review and appears unprofessional.

Example - Changing "30 days" to "60 days" in a sentence:

```python
# BAD - Replaces entire sentence
'<w:del><w:r><w:delText>The term is 30 days.</w:delText></w:r></w:del><w:ins><w:r><w:t>The term is 60 days.</w:t></w:r></w:ins>'

# GOOD - Only marks what changed
'<w:r><w:t>The term is </w:t></w:r><w:del><w:r><w:delText>30</w:delText></w:r></w:del><w:ins><w:r><w:t>60</w:t></w:r></w:ins><w:r><w:t> days.</w:t></w:r>'
```

### Tracked changes workflow

1. **Get markdown representation**: Convert document to markdown with tracked changes preserved:
```bash
pandoc --track-changes=all path-to-file.docx -o current.md
```

2. **Identify and group changes**: Review the document and identify ALL changes needed

3. **Read documentation and unpack**:
   - Read `ooxml.md` in this skill directory
   - Unpack the document: `unzip document.docx -d unpacked/`

4. **Implement changes in batches**: Group changes logically and implement them

5. **Pack the document**:
```bash
cd unpacked && zip -r ../reviewed-document.docx . && cd ..
```

6. **Final verification**:
```bash
pandoc --track-changes=all reviewed-document.docx -o verification.md
```

## Converting Documents to Images

To visually analyze Word documents, convert them to images using a two-step process:

1. **Convert DOCX to PDF**:
```bash
soffice --headless --convert-to pdf document.docx
```

2. **Convert PDF pages to JPEG images**:
```bash
pdftoppm -jpeg -r 150 document.pdf page
```

This creates files like `page-1.jpg`, `page-2.jpg`, etc.

## Code Style Guidelines

**IMPORTANT**: When generating code for DOCX operations:

- Write concise code
- Avoid verbose variable names and redundant operations
- Avoid unnecessary print statements

## Dependencies

Required dependencies (install if not available):

- **pandoc**: `brew install pandoc` or `sudo apt-get install pandoc` (for text extraction)
- **docx**: `npm install docx` (for creating new documents)
- **LibreOffice**: `brew install --cask libreoffice` (for PDF conversion)
- **Poppler**: `brew install poppler` or `sudo apt-get install poppler-utils` (for pdftoppm)
