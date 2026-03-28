import os
import re

frontend_dir = r"d:\Crisis Link AI\frontend"

# We want to replace all messed up occurrences:
# '${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}'
# or pure 'http://localhost:5000' or "http://localhost:5000"

def fix_urls():
    for root, dirs, files in os.walk(frontend_dir):
        # skip node_modules
        if 'node_modules' in dirs:
            dirs.remove('node_modules')
        if '.next' in dirs:
            dirs.remove('.next')
            
        for file in files:
            if file.endswith('.jsx') or file.endswith('.js'):
                filepath = os.path.join(root, file)
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()

                original_content = content

                # Fix single quote broken interpolation
                content = content.replace(
                    "'${process.env.NEXT_PUBLIC_API_URL || \"http://localhost:5000\"}/api",
                    "(process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? 'http://' + window.location.hostname + ':5000' : 'http://localhost:5000')) + '/api"
                )
                
                # Fix double quote broken interpolation if any
                content = content.replace(
                    "\"${process.env.NEXT_PUBLIC_API_URL || \\\"http://localhost:5000\\\"}/api",
                    "(process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? 'http://' + window.location.hostname + ':5000' : 'http://localhost:5000')) + '/api"
                )

                # Fix backtick broken interpolation
                content = content.replace(
                    "`${process.env.NEXT_PUBLIC_API_URL || \"http://localhost:5000\"}/api",
                    "`${process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? 'http://' + window.location.hostname + ':5000' : 'http://localhost:5000')}/api"
                )

                # Fix original http://localhost:5000/api in single quotes
                content = content.replace(
                    "'http://localhost:5000/api",
                    "(process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? 'http://' + window.location.hostname + ':5000' : 'http://localhost:5000')) + '/api"
                )
                
                # Fix original http://localhost:5000/api in double quotes
                content = content.replace(
                    "\"http://localhost:5000/api",
                    "(process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? 'http://' + window.location.hostname + ':5000' : 'http://localhost:5000')) + '/api"
                )
                
                # Fix original http://localhost:5000/api in backticks
                content = content.replace(
                    "`http://localhost:5000/api",
                    "`${process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? 'http://' + window.location.hostname + ':5000' : 'http://localhost:5000')}/api"
                )

                if content != original_content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(content)
                    print(f"Fixed: {filepath}")

if __name__ == '__main__':
    fix_urls()
