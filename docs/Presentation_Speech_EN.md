# Presentation speech → moved

The up-to-date, simplified presentation speech (English to deliver + Turkish translation), the plain-language
model explanation and the likely questions with answers are now in one PDF:

**[docs/Sunum_Paketi_TR_EN.pdf](Sunum_Paketi_TR_EN.pdf)** (source: [docs/src/sunum_paketi.html](src/sunum_paketi.html)).

To regenerate the PDF after editing the HTML (e.g. updating the [bracketed] numbers after the real experiment),
open the HTML in Chrome/Edge and "Print → Save as PDF", or run Chrome headless:

```
chrome --headless=new --no-pdf-header-footer --print-to-pdf=Sunum_Paketi_TR_EN.pdf src/sunum_paketi.html
```
