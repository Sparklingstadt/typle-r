using System.Globalization;
using System.Text;

namespace Typle.Core;

public enum WordFileFormat { Csv, Tsv }

// src/plugins/formats/delimited.ts
public static class WordFiles
{
    /// <summary>Larger word files are refused before they are read.</summary>
    public const int MaxImportBytes = 1024 * 1024;

    /// <summary>The format for a file name's extension, or null for other files.</summary>
    public static WordFileFormat? FormatOf(string fileName) => Path.GetExtension(fileName).ToLowerInvariant() switch
    {
        ".csv" => WordFileFormat.Csv,
        ".tsv" => WordFileFormat.Tsv,
        _ => null,
    };

    /// <summary>Reads a UTF-8 word file, refusing other encodings and files over the size limit.</summary>
    public static IReadOnlyList<Word> ParseData(byte[] data, WordFileFormat format)
    {
        if (data.Length > MaxImportBytes) throw new TypleException("importTooLarge");
        string text;
        try
        {
            text = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true).GetString(data);
        }
        catch (DecoderFallbackException)
        {
            throw new TypleException("importFileEncoding");
        }
        return Parse(text, format);
    }

    private sealed record Row(List<string> Cells, int Line);

    /// <summary>Reads CSV and TSV, including escaped quotes and quoted multiline fields.</summary>
    public static IReadOnlyList<Word> Parse(string source, WordFileFormat format)
    {
        if (Encoding.UTF8.GetByteCount(source) > MaxImportBytes) throw new TypleException("importTooLarge");
        var delimiter = format == WordFileFormat.Csv ? ',' : '\t';
        var text = Text.CodePoints(source);
        if (text.Count > 0 && text[0] == 0xFEFF) text.RemoveAt(0);
        var rows = new List<Row>();
        var cells = new List<string>();
        var value = new StringBuilder();
        var quoted = false;
        var closed = false;
        var line = 1;
        var start = 1;
        TypleException Fail() => TypleException.With("importQuote", "line", line.ToString(CultureInfo.InvariantCulture));
        void Field()
        {
            cells.Add(value.ToString());
            value.Clear();
            closed = false;
        }
        void EndRow()
        {
            var explicitRow = closed;
            Field();
            if (cells.Count > 1 || cells.Any(cell => !Text.IsBlank(cell)) || explicitRow) rows.Add(new Row(cells, start));
            cells = [];
        }
        for (var i = 0; i < text.Count; i++)
        {
            var c = text[i];
            int? next = i + 1 < text.Count ? text[i + 1] : null;
            if (quoted)
            {
                if (c == '"')
                {
                    if (next == '"')
                    {
                        value.Append('"');
                        i++;
                    }
                    else
                    {
                        quoted = false;
                        closed = true;
                    }
                }
                else
                {
                    value.Append(Text.FromCodePoint(c));
                    if (c == '\n' || (c == '\r' && next != '\n')) line++;
                }
            }
            else if (c == delimiter)
            {
                Field();
            }
            else if (c is '\r' or '\n')
            {
                EndRow();
                if (c == '\r' && next == '\n') i++;
                line++;
                start = line;
            }
            else if (closed)
            {
                throw Fail();
            }
            else if (c == '"')
            {
                if (value.Length > 0) throw Fail();
                quoted = true;
            }
            else
            {
                value.Append(Text.FromCodePoint(c));
            }
        }
        if (quoted) throw Fail();
        EndRow();
        List<string> header = [];
        if (rows.Count > 0)
        {
            header = rows[0].Cells.Select(cell => cell.Trim() == "anotation" ? "annotation" : cell.Trim()).ToList();
            rows.RemoveAt(0);
        }
        if (!header.Contains("input") || !header.Contains("display")) throw new TypleException("importHeaderRequired");
        if (header.Distinct().Count() != header.Count) throw new TypleException("importHeaderDuplicate");
        if (header.Any(name => name is not ("input" or "display" or "annotation"))) throw new TypleException("importHeaderUnknown");
        if (rows.Count == 0) throw new TypleException("importNoRows");
        if (rows.Count > WordLists.MaxWords) throw new TypleException("importTooManyRows");
        return rows.Select(row =>
        {
            var lineText = row.Line.ToString(CultureInfo.InvariantCulture);
            if (row.Cells.Count != header.Count) throw TypleException.With("importColumnCount", "line", lineText);
            string Get(string name) => header.IndexOf(name) is var index and >= 0 ? row.Cells[index] : "";
            var word = new Word(Get("display"), Get("input"), Get("annotation"));
            if (Text.IsBlank(word.Input) || Text.IsBlank(word.Display)) throw TypleException.With("importFieldRequired", "line", lineText);
            if (word.Input.Length > WordLists.MaxWordField || word.Display.Length > WordLists.MaxWordField ||
                word.Annotation.Length > WordLists.MaxAnnotation)
            {
                throw TypleException.With("importFieldTooLong", "line", lineText);
            }
            return word;
        }).ToList();
    }

    /// <summary>Keeps exact typing strings, including whitespace, quotes and newlines.</summary>
    public static string EncodeCsv(IReadOnlyList<Word> words)
    {
        static string Cell(string value) => "\"" + value.Replace("\"", "\"\"") + "\"";
        return "﻿input,display,annotation\r\n" +
               string.Join("\r\n", words.Select(word => string.Join(",", Cell(word.Input), Cell(word.Display), Cell(word.Annotation)))) +
               "\r\n";
    }
}
