# File Attachment List

Composition template for displaying and managing file attachments.

## What It Provides

- File list with icon, name, size, and upload date
- Upload dropzone with drag-and-drop
- Upload progress indicator
- File type icon mapping
- Download and delete actions per file

## States Handled

- Loading (skeleton list)
- Empty (no attachments, show upload prompt)
- Uploading (progress bar per file)
- Upload error (retry per file)
- Populated (normal file list)
- Deleting (confirmation dialog)

## What Builder Fills

- Allowed file types and size limits
- Convex file storage bindings
- Delete permission rules
- Preview behavior per file type (image preview, PDF viewer, etc.)
- Virus scan or validation integration (if needed)
