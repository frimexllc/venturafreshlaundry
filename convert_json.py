#!/usr/bin/env python3
"""
Convert between JSON (array of docs) and JSONL (one doc per line).
Usage:
  python convert_json.py --input data.json --output data.jsonl
  python convert_json.py --input data.jsonl --output data.json
"""
import argparse
import json
import sys

def json_to_jsonl(input_file, output_file):
    """Convert JSON array file to JSONL file"""
    with open(input_file, 'r', encoding='utf-8') as f:
        docs = json.load(f)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        for doc in docs:
            f.write(json.dumps(doc, ensure_ascii=False) + '\n')
    
    print(f"Converted {len(docs)} docs from {input_file} to {output_file}")

def jsonl_to_json(input_file, output_file):
    """Convert JSONL file to JSON array file"""
    docs = []
    with open(input_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    docs.append(json.loads(line))
                except Exception as e:
                    print(f"Warning: Skipping invalid line: {str(e)}", file=sys.stderr)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(docs, f, ensure_ascii=False, indent=2)
    
    print(f"Converted {len(docs)} docs from {input_file} to {output_file}")

def main():
    parser = argparse.ArgumentParser(description="Convert between JSON and JSONL")
    parser.add_argument("--input", "-i", required=True, help="Input file path")
    parser.add_argument("--output", "-o", required=True, help="Output file path")
    
    args = parser.parse_args()
    
    if args.input.lower().endswith('.json'):
        json_to_jsonl(args.input, args.output)
    elif args.input.lower().endswith('.jsonl'):
        jsonl_to_json(args.input, args.output)
    else:
        print("Error: Input file must be .json or .jsonl", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()