
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

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
  
  const TooltipButton = ({ tooltip, onClick, isActive, children, disabled }: { tooltip: string, onClick: () => void, isActive?: boolean, children: React.ReactNode, disabled?: boolean }) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <Button type="button" onClick={onClick} variant={isActive ? 'secondary' : 'ghost'} size="sm" disabled={disabled}>{children}</Button>
        </TooltipTrigger>
        <TooltipContent>
            <p>{tooltip}</p>
        </TooltipContent>
    </Tooltip>
  );

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-t-md border border-input bg-transparent p-1">
        <TooltipProvider>
            <TooltipButton tooltip="Bold" onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')}><Bold /></TooltipButton>
            <TooltipButton tooltip="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')}><Italic /></TooltipButton>
            <TooltipButton tooltip="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')}><UnderlineIcon /></TooltipButton>
            <TooltipButton tooltip="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')}><Strikethrough /></TooltipButton>
            <Separator />
            <TooltipButton tooltip="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })}><Heading1 /></TooltipButton>
            <TooltipButton tooltip="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })}><Heading2 /></TooltipButton>
            <TooltipButton tooltip="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })}><Heading3 /></TooltipButton>
            <Separator />
            <TooltipButton tooltip="Bullet List" onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')}><List /></TooltipButton>
            <TooltipButton tooltip="Ordered List" onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')}><ListOrdered /></TooltipButton>
            <TooltipButton tooltip="Blockquote" onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')}><Quote /></TooltipButton>
            <Separator />
            <TooltipButton tooltip="Align Left" onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })}><AlignLeft /></TooltipButton>
            <TooltipButton tooltip="Align Center" onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })}><AlignCenter /></TooltipButton>
            <TooltipButton tooltip="Align Right" onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })}><AlignRight /></TooltipButton>
            <Separator />
            <Popover>
                <PopoverTrigger asChild><Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="sm"><Palette /></Button></TooltipTrigger><TooltipContent><p>Text Color</p></TooltipContent></Tooltip></PopoverTrigger>
                <PopoverContent className="w-auto p-2"><div className="grid grid-cols-6 gap-1">{FONT_COLORS.map(color => (<Button key={color} type="button" onClick={() => editor.chain().focus().setColor(color).run()} variant={editor.isActive('textStyle', { color }) ? 'secondary' : 'ghost'} size="icon" className="h-6 w-6 rounded-sm"><div className="h-4 w-4 rounded-sm border" style={{ backgroundColor: color }} /></Button>))}</div></PopoverContent>
            </Popover>
            <TooltipButton tooltip="Set Link" onClick={setLink} isActive={editor.isActive('link')}><LinkIcon /></TooltipButton>
            <TooltipButton tooltip="Add Image" onClick={addImage}><ImageIcon /></TooltipButton>
            <Separator />
            <TooltipButton tooltip="Insert Table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon /></TooltipButton>
            <Separator />
            <TooltipButton tooltip="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo /></TooltipButton>
            <TooltipButton tooltip="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo /></TooltipButton>
            <TooltipButton tooltip="Clear Formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><Trash2 /></TooltipButton>
        </TooltipProvider>
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
      Image.configure({
        HTMLAttributes: {
          class: 'inline-block',
        },
      }).extend({
        parseHTML() {
          return [
            {
              tag: 'img[src]',
              getAttrs: (dom) => {
                const element = dom as HTMLElement;
                // Ignore Google emoji images
                if (element.classList.contains('goomoji')) {
                  return false;
                }
                if (element.getAttribute('data-emoji-char')) {
                   return false;
                }
                return {};
              },
            },
          ];
        },
      }),
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
          'prose dark:prose-invert prose-sm sm:prose-base focus:outline-none max-w-none',
          'min-h-[150px] w-full rounded-b-md border-x border-b border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50'
        ),
      },
    },
  });

  return (
    <div>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
