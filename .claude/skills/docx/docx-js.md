# DOCX Library Tutorial

Generate .docx files with JavaScript/TypeScript.

**Important: Read this entire document before starting.** Critical formatting rules and common pitfalls are covered throughout - skipping sections may result in corrupted files or rendering issues.

## Setup

```bash
npm install docx
```

```javascript
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  Header, Footer, AlignmentType, PageOrientation, LevelFormat, ExternalHyperlink,
  InternalHyperlink, TableOfContents, HeadingLevel, BorderStyle, WidthType, TabStopType,
  TabStopPosition, UnderlineType, ShadingType, VerticalAlign, SymbolRun, PageNumber,
  FootnoteReferenceRun, Footnote, PageBreak } = require('docx');
const fs = require('fs');

// Create & Save
const doc = new Document({ sections: [{ children: [/* content */] }] });
Packer.toBuffer(doc).then(buffer => fs.writeFileSync("doc.docx", buffer));
```

## Text & Formatting

```javascript
// IMPORTANT: Never use \n for line breaks - always use separate Paragraph elements
// WRONG: new TextRun("Line 1\nLine 2")
// CORRECT: new Paragraph({ children: [new TextRun("Line 1")] }), new Paragraph({ children: [new TextRun("Line 2")] })

// Basic text with all formatting options
new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 200, after: 200 },
  indent: { left: 720, right: 720 },
  children: [
    new TextRun({ text: "Bold", bold: true }),
    new TextRun({ text: "Italic", italics: true }),
    new TextRun({ text: "Underlined", underline: { type: UnderlineType.DOUBLE, color: "FF0000" } }),
    new TextRun({ text: "Colored", color: "FF0000", size: 28, font: "Arial" }),
    new TextRun({ text: "Highlighted", highlight: "yellow" }),
    new TextRun({ text: "Strikethrough", strike: true }),
    new TextRun({ text: "x2", superScript: true }),
    new TextRun({ text: "H2O", subScript: true }),
    new TextRun({ text: "SMALL CAPS", smallCaps: true }),
  ]
})
```

## Styles & Professional Formatting

```javascript
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 24 } } }, // 12pt default
    paragraphStyles: [
      // Document title style
      { id: "Title", name: "Title", basedOn: "Normal",
        run: { size: 56, bold: true, color: "000000", font: "Arial" },
        paragraph: { spacing: { before: 240, after: 120 }, alignment: AlignmentType.CENTER } },
      // Heading styles - use exact IDs to override built-in styles
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, color: "000000", font: "Arial" },
        paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, color: "000000", font: "Arial" },
        paragraph: { spacing: { before: 180, after: 180 }, outlineLevel: 1 } },
      // Custom styles use your own IDs
      { id: "myStyle", name: "My Style", basedOn: "Normal",
        run: { size: 28, bold: true, color: "000000" },
        paragraph: { spacing: { after: 120 }, alignment: AlignmentType.CENTER } }
    ],
  },
  sections: [{
    properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    children: [
      new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun("Document Title")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Heading 1")] }),
      new Paragraph({ style: "myStyle", children: [new TextRun("Custom paragraph style")] }),
    ]
  }]
});
```

**Professional Font Combinations:**
- **Arial (Headers) + Arial (Body)** - Most universally supported
- **Times New Roman (Headers) + Arial (Body)** - Classic serif with modern sans-serif
- **Georgia (Headers) + Verdana (Body)** - Optimized for screen reading

## Lists

```javascript
// CRITICAL: Use LevelFormat.BULLET constant, NOT the string "bullet"
// NEVER use unicode bullets like "•" - always use proper numbering config
const doc = new Document({
  numbering: {
    config: [
      { reference: "bullet-list",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbered-list",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [{
    children: [
      // Bullet list
      new Paragraph({ numbering: { reference: "bullet-list", level: 0 },
        children: [new TextRun("First bullet point")] }),
      new Paragraph({ numbering: { reference: "bullet-list", level: 0 },
        children: [new TextRun("Second bullet point")] }),
      // Numbered list
      new Paragraph({ numbering: { reference: "numbered-list", level: 0 },
        children: [new TextRun("First numbered item")] }),
      new Paragraph({ numbering: { reference: "numbered-list", level: 0 },
        children: [new TextRun("Second numbered item")] }),
    ]
  }]
});

// CRITICAL: Each reference creates an INDEPENDENT numbered list
// Same reference = continues numbering (1, 2, 3...)
// Different reference = restarts at 1
```

## Tables

```javascript
const tableBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const cellBorders = { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder };

new Table({
  columnWidths: [4680, 4680], // Values in DXA (1440 = 1 inch)
  margins: { top: 100, bottom: 100, left: 180, right: 180 },
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          borders: cellBorders,
          width: { size: 4680, type: WidthType.DXA },
          // CRITICAL: Always use ShadingType.CLEAR to prevent black backgrounds
          shading: { fill: "D5E8F0", type: ShadingType.CLEAR },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Header 1", bold: true, size: 22 })]
          })]
        }),
        new TableCell({
          borders: cellBorders,
          width: { size: 4680, type: WidthType.DXA },
          shading: { fill: "D5E8F0", type: ShadingType.CLEAR },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Header 2", bold: true, size: 22 })]
          })]
        })
      ]
    }),
    new TableRow({
      children: [
        new TableCell({
          borders: cellBorders,
          width: { size: 4680, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun("Data 1")] })]
        }),
        new TableCell({
          borders: cellBorders,
          width: { size: 4680, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun("Data 2")] })]
        })
      ]
    })
  ]
})
```

**Precomputed Column Widths (Letter size with 1" margins = 9360 DXA total):**
- **2 columns:** `columnWidths: [4680, 4680]`
- **3 columns:** `columnWidths: [3120, 3120, 3120]`

## Links & Navigation

```javascript
// Table of Contents (requires headings with HeadingLevel)
new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),

// External link
new Paragraph({
  children: [new ExternalHyperlink({
    children: [new TextRun({ text: "Google", style: "Hyperlink" })],
    link: "https://www.google.com"
  })]
}),

// Internal link & bookmark
new Paragraph({
  children: [new InternalHyperlink({
    children: [new TextRun({ text: "Go to Section", style: "Hyperlink" })],
    anchor: "section1"
  })]
}),
new Paragraph({
  children: [new TextRun("Section Content")],
  bookmark: { id: "section1", name: "section1" }
}),
```

## Images

```javascript
// CRITICAL: Always specify 'type' parameter - it's REQUIRED
new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new ImageRun({
    type: "png", // REQUIRED: png, jpg, jpeg, gif, bmp, svg
    data: fs.readFileSync("image.png"),
    transformation: { width: 200, height: 150, rotation: 0 },
    altText: { title: "Logo", description: "Company logo", name: "Name" }
  })]
})
```

## Page Breaks

```javascript
// CRITICAL: PageBreak must ALWAYS be inside a Paragraph
// WRONG: new PageBreak() - creates invalid XML
// CORRECT:
new Paragraph({ children: [new PageBreak()] }),

// Page break before paragraph
new Paragraph({
  pageBreakBefore: true,
  children: [new TextRun("This starts on a new page")]
})
```

## Headers/Footers & Page Setup

```javascript
const doc = new Document({
  sections: [{
    properties: {
      page: {
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1440 = 1 inch
        size: { orientation: PageOrientation.LANDSCAPE },
        pageNumbers: { start: 1, formatType: "decimal" }
      }
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun("Header Text")]
      })] })
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun("Page "),
          new TextRun({ children: [PageNumber.CURRENT] }),
          new TextRun(" of "),
          new TextRun({ children: [PageNumber.TOTAL_PAGES] })
        ]
      })] })
    },
    children: [/* content */]
  }]
});
```

## Tabs

```javascript
new Paragraph({
  tabStops: [
    { type: TabStopType.LEFT, position: TabStopPosition.MAX / 4 },
    { type: TabStopType.CENTER, position: TabStopPosition.MAX / 2 },
    { type: TabStopType.RIGHT, position: TabStopPosition.MAX * 3 / 4 }
  ],
  children: [new TextRun("Left\tCenter\tRight")]
})
```

## Constants & Quick Reference

- **Underlines:** `SINGLE`, `DOUBLE`, `WAVY`, `DASH`
- **Borders:** `SINGLE`, `DOUBLE`, `DASHED`, `DOTTED`
- **Numbering:** `DECIMAL` (1,2,3), `UPPER_ROMAN` (I,II,III), `LOWER_LETTER` (a,b,c)
- **Tabs:** `LEFT`, `CENTER`, `RIGHT`, `DECIMAL`
- **Measurements:** DXA units (1440 = 1 inch)

## Critical Issues & Common Mistakes

- **PageBreak must ALWAYS be inside a Paragraph** - standalone creates invalid XML
- **ALWAYS use ShadingType.CLEAR for table cell shading** - Never use SOLID (causes black background)
- **ALWAYS use custom styles** with Arial font for professional appearance
- **ALWAYS set a default font** using `styles.default.document.run.font`
- **ALWAYS use columnWidths array for tables** + individual cell widths
- **NEVER use unicode symbols for bullets** - use proper numbering config with `LevelFormat.BULLET`
- **NEVER use \n for line breaks** - use separate Paragraph elements
- **ALWAYS use TextRun objects within Paragraph children** - never use text property directly
- **ImageRun REQUIRES `type` parameter** - always specify format
- **For TOC**: headings must use HeadingLevel ONLY - do NOT add custom styles
- **Tables**: Set `columnWidths` array + individual cell widths, apply borders to cells not table
