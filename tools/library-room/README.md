# tools/library-room

Lädt die CC0-Assets der 3D-Bibliothek von Poly Haven und packt sie für das Web
(Modelle als .glb mit 1K-WebP-Texturen, Texturen 1K WebP, HDRI 1K .hdr).

    pip install pillow
    python tools/library-room/fetch.py

Schreibt nach `frontend/LuminaChronica.Client/wwwroot/assets/library-room/`
inklusive `CREDITS.md`. Budget: insgesamt ≤ 15 MB.
