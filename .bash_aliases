alias aptup='sudo apt update && sudo apt upgrade'
alias aptin='sudo apt install'
alias aptrm='sudo apt remove'
alias .1='cd ..'
alias .2='cd ../..'
alias .3='cd ../../..'
alias web='cd ~/Desktop/git/govindchari.github.io && code .'
alias buildweb='bundle exec jekyll serve'
alias open='nautilus .'
alias vs='code .'
alias gri='grep -rin'
alias cl='clear'
alias cdg='cd ~/Desktop/git'
alias papers='cd ~/Desktop/Papers/ && nautilus .'
alias svba='source venv/bin/activate'
alias cam='conda activate manim-env'

mat(){
matlab -nodisplay -nosplash -nodesktop -r "run('$1');exit;" | tail -n +11
}
