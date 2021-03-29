#!/bin/sh
VERSION="v0.0.28"
git tag -a $VERSION -m $VERSION
git push origin --tags
