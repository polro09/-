# EJS 및 관련 패키지 설치
npm install ejs express-ejs-layouts

# 개발 도구 설치 (선택사항)
npm install --save-dev compression

# 디렉토리 구조 생성
mkdir -p src/web/views/layouts
mkdir -p src/web/views/partials
mkdir -p src/web/views/pages
mkdir -p src/web/views/components
mkdir -p src/web/public/css
mkdir -p src/web/public/js/components
mkdir -p src/web/public/js/modules

# Git에 빈 디렉토리 추가를 위한 .gitkeep 파일 생성
touch src/web/views/layouts/.gitkeep
touch src/web/views/partials/.gitkeep
touch src/web/views/pages/.gitkeep
touch src/web/views/components/.gitkeep
touch src/web/public/js/components/.gitkeep
touch src/web/public/js/modules/.gitkeep

echo "✅ EJS 패키지 설치 및 디렉토리 구조 생성 완료!"