import re
import os
from urllib.parse import quote
import warnings

CHAPTERS = (
    ('走进 CPython', 'intro.md'),
    ('类', 'class.md'),
    ('函数', 'func.md'),
    ('生成器', 'gen.md'),
    ('异常', 'except.md'),
)

def extract_h2_titles(file_path):
    if not os.path.exists(file_path):
        return []

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    h2_pattern = r'^## (.+)$'
    titles = re.findall(h2_pattern, content, re.MULTILINE)
    return titles

def create_markdown_anchor(title):
    title = re.sub(r'`([^`]+)`', r'\1', title)
    anchor = title.lower()
    anchor = re.sub(r'\s+', '-', anchor)
    anchor = re.sub(r'[^\w\u4e00-\u9fff-]', '', anchor)
    def encode_chinese(match):
        return quote(match.group(0))
    anchor = re.sub(r'[\u4e00-\u9fff]+', encode_chinese, anchor)
    return anchor

def generate_toc_entry(title, base_url, anchor):
    link = f"{base_url}#{anchor}"
    return f"    - [{title}]({link})"

def update_readme():
    readme_path = "README.md"
    base_url_template = "https://github.com/gndlwch2w/python-hows/blob/main/{}"
    
    with open(readme_path, 'r', encoding='utf-8') as f:
        content = f.read()
    lines = content.split('\n')
    
    title_line_idx = -1
    intro_end_idx = -1
    for i, line in enumerate(lines):
        if line.strip().startswith('# '):
            title_line_idx = i
        elif title_line_idx >= 0 and line.strip() and not line.startswith('- [') and not line.startswith('    -'):
            intro_end_idx = i
        elif title_line_idx >= 0 and intro_end_idx >= 0 and line.startswith('- ['):
            break
    
    if intro_end_idx == -1 and title_line_idx >= 0:
        intro_end_idx = title_line_idx + 1
    
    new_content = []
    if intro_end_idx >= 0:
        new_content.extend(lines[:intro_end_idx + 1])
    else:
        new_content.extend(lines)
        
    if new_content and new_content[-1].strip():
        new_content.append("")
    
    for section_title, filename in CHAPTERS:
        if not os.path.exists(filename):
            warnings.warn(f"{filename} is missing, skipping section '{section_title}'")
            continue
            
        base_url = base_url_template.format(filename)
        main_entry = f"- [{section_title}]({base_url})"
        new_content.append(main_entry)
        titles = extract_h2_titles(filename)
        for title in titles:
            anchor = create_markdown_anchor(title)
            toc_entry = generate_toc_entry(title, base_url, anchor)
            new_content.append(toc_entry)
    
    with open(readme_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(new_content))

    print("README.md updated")

if __name__ == "__main__":
    update_readme()
