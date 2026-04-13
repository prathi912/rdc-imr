import sys
from pypdf import PdfReader

def extract_text(filename):
    print(f"\n\n--- CONTENT OF {filename} ---\n\n")
    try:
        reader = PdfReader(filename)
        for page in reader.pages:
            text = page.extract_text()
            if text:
                print(text)
    except Exception as e:
        print(f"Error reading {filename}: {e}")

extract_text("Notification 1446_Revision in the Research & Development Policy of the University.pdf")
extract_text("Notification 1639_Revision in the Research & Development Policy of the University (1).pdf")
