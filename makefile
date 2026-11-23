.DEFAULT_GOAL := build

CONFIGURATION ?= Debug
DERIVED_DATA_PATH ?= .build/Xcode
TEST_DESTINATION ?= platform=iOS Simulator,name=iPhone 16,OS=latest

XCODE_FLAGS = -project swift/Pinto.xcodeproj -scheme Pinto \
	-configuration "$(CONFIGURATION)" -derivedDataPath "$(DERIVED_DATA_PATH)" \
	CODE_SIGNING_ALLOWED=NO
SWIFT_PATHS = swift/Pinto swift/PintoTests

.PHONY: build test test-ios lint format fmt

build:
	xcodebuild $(XCODE_FLAGS) -destination 'generic/platform=iOS' build

test: test-ios

test-ios:
	xcodebuild $(XCODE_FLAGS) -destination '$(TEST_DESTINATION)' \
		-parallel-testing-enabled NO -test-timeouts-enabled YES \
		-maximum-test-execution-time-allowance 120 \
		-only-testing:PintoTests test

lint:
	xcrun swift-format lint --strict --recursive $(SWIFT_PATHS)

fmt format:
	xcrun swift-format format --in-place --recursive $(SWIFT_PATHS)
