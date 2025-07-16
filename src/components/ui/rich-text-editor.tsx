
'use client';

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Heading from '@tiptap/extension-heading';

import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Link as LinkIcon,
  List, ListOrdered, Quote, Code, Pilcrow, Heading1, Heading2, Heading3,
  Image as ImageIcon, Table as TableIcon, AlignLeft, AlignCenter, AlignRight,
  Undo, Redo, Palette, Trash2
} from 'lucide-react';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

const Toolbar = ({ editor }: { editor: Editor | null }) => {
  if (!editor) {
    return null;
  }

  const setLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const addImage = useCallback(() => {
    const url = window.prompt('Image URL');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const FONT_COLORS = [
    '#000000', '#444444', '#666666', '#999999', '#CCCCCC', '#FFFFFF',
    '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3',
    '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39',
    '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#795548', '#607d8b',
  ];

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-t-md border border-input bg-transparent p-1">
      <Button type="button" onClick={() => editor.chain().focus().toggleBold().run()} variant={editor.isActive('bold') ? 'secondary' : 'ghost'} size="sm"><Bold /></Button>
      <Button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} variant={editor.isActive('italic') ? 'secondary' : 'ghost'} size="sm"><Italic /></Button>
      <Button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} variant={editor.isActive('underline') ? 'secondary' : 'ghost'} size="sm"><UnderlineIcon /></Button>
      <Button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} variant={editor.isActive('strike') ? 'secondary' : 'ghost'} size="sm"><Strikethrough /></Button>
      
      <Separator />

      <Button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} variant={editor.isActive('heading', { level: 1 }) ? 'secondary' : 'ghost'} size="sm"><Heading1 /></Button>
      <Button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} variant={editor.isActive('heading', { level: 2 }) ? 'secondary' : 'ghost'} size="sm"><Heading2 /></Button>
      <Button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} variant={editor.isActive('heading', { level: 3 }) ? 'secondary' : 'ghost'} size="sm"><Heading3 /></Button>
      
      <Separator />
      
      <Button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} variant={editor.isActive('bulletList') ? 'secondary' : 'ghost'} size="sm"><List /></Button>
      <Button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} variant={editor.isActive('orderedList') ? 'secondary' : 'ghost'} size="sm"><ListOrdered /></Button>
      <Button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} variant={editor.isActive('blockquote') ? 'secondary' : 'ghost'} size="sm"><Quote /></Button>
      
      <Separator />
      
      <Button type="button" onClick={() => editor.chain().focus().setTextAlign('left').run()} variant={editor.isActive({ textAlign: 'left' }) ? 'secondary' : 'ghost'} size="sm"><AlignLeft /></Button>
      <Button type="button" onClick={() => editor.chain().focus().setTextAlign('center').run()} variant={editor.isActive({ textAlign: 'center' }) ? 'secondary' : 'ghost'} size="sm"><AlignCenter /></Button>
      <Button type="button" onClick={() => editor.chain().focus().setTextAlign('right').run()} variant={editor.isActive({ textAlign: 'right' }) ? 'secondary' : 'ghost'} size="sm"><AlignRight /></Button>
      
      <Separator />

      <Popover>
        <PopoverTrigger asChild><Button type="button" variant="ghost" size="sm"><Palette /></Button></PopoverTrigger>
        <PopoverContent className="w-auto p-2">
          <div className="grid grid-cols-6 gap-1">
            {FONT_COLORS.map(color => (
              <Button key={color} type="button" onClick={() => editor.chain().focus().setColor(color).run()} variant={editor.isActive('textStyle', { color }) ? 'secondary' : 'ghost'} size="icon" className="h-6 w-6 rounded-sm">
                <div className="h-4 w-4 rounded-sm border" style={{ backgroundColor: color }} />
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Button type="button" onClick={setLink} variant={editor.isActive('link') ? 'secondary' : 'ghost'} size="sm"><LinkIcon /></Button>
      <Button type="button" onClick={addImage} variant="ghost" size="sm"><ImageIcon /></Button>
      
      <Separator />
      
      <Button type="button" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} variant="ghost" size="sm"><TableIcon /></Button>
      
      <Separator />
      
      <Button type="button" onClick={() => editor.chain().focus().undo().run()} variant="ghost" size="sm" disabled={!editor.can().undo()}><Undo /></Button>
      <Button type="button" onClick={() => editor.chain().focus().redo().run()} variant="ghost" size="sm" disabled={!editor.can().redo()}><Redo /></Button>
      <Button type="button" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} variant="ghost" size="sm"><Trash2 /></Button>
    </div>
  );
};

const Separator = () => <div className="h-5 w-px bg-input" />;

export interface RichTextEditorProps {
  value?: string;
  onChange: (value: string) => void;
}

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image,
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      TextStyle,
      Color,
      Heading.configure({
        levels: [1, 2, 3],
      }),
    ],
    content: value,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose dark:prose-invert prose-sm sm:prose-base m-5 focus:outline-none max-w-none',
          'min-h-[150px] w-full rounded-b-md border-x border-b border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50'
        ),
      },
    },
  });

  return (
    <div className="border rounded-md">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
