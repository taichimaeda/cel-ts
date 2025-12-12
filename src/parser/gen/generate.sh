#!/bin/bash
# Generate TypeScript parser from ANTLR grammar
#
# Usage: ./generate.sh
#
# Requirements:
# - Java Runtime Environment (JRE)
# - ANTLR 4.13.1 JAR file

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANTLR_VERSION="4.13.1"
ANTLR_JAR="${DIR}/antlr-${ANTLR_VERSION}-complete.jar"

# Download ANTLR JAR if not present
if [ ! -f "${ANTLR_JAR}" ]; then
    echo "Downloading ANTLR ${ANTLR_VERSION}..."
    curl -o "${ANTLR_JAR}" "https://www.antlr.org/download/antlr-${ANTLR_VERSION}-complete.jar"
fi

echo "Generating TypeScript parser from CEL.g4..."

# Generate parser with TypeScript target
java -Xmx500M -cp "${ANTLR_JAR}" org.antlr.v4.Tool \
    -Dlanguage=TypeScript \
    -visitor \
    -no-listener \
    -o "${DIR}" \
    "${DIR}/CEL.g4"

# Add @ts-nocheck to generated files
echo "Adding @ts-nocheck to generated files..."
for file in "${DIR}"/CEL*.ts; do
    if [ -f "$file" ]; then
        # Add @ts-nocheck to generated files (excluding index.ts)
        if [[ "$file" != *"index.ts" ]]; then
            # Only add if not already present
            if ! grep -q "@ts-nocheck" "$file"; then
                sed -i '' '1s/^/\/\/ @ts-nocheck\n/' "$file"
            fi
        fi
    fi
done

echo "Parser generation complete!"
echo "Generated files:"
ls -la "${DIR}"/CEL*.ts 2>/dev/null || echo "No TypeScript files generated"
