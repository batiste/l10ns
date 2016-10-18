cmake_minimum_required(VERSION 3.6)
set(VERSION "3.0")
project(l10ns)

set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -std=c++14")
set(EXECUTABLE_OUTPUT_PATH "Binary")
include_directories("${PROJECT_BINARY_DIR}")
include_directories("${PROJECT_BINARY_DIR}/Source/Compiler")

configure_file(Source/Compiler/Configurations.h.in Source/Compiler/Configurations.h)

add_executable(l10ns Source/Compiler/Binary.cpp)