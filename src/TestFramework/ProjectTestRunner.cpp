
#include "Core.cpp"
#include "Utils.cpp"
#include "Configurations.h"
#include <fstream>
#include <exception>

using namespace std;
using namespace L10ns;

namespace TestFramework {

void addProjectTests() {
    auto paths = find_files("src/Tests/Cases/Projects/*", PROJECT_DIR);

    domain("Project Tests");

    for (auto const &p : paths) {
        auto command = read_file(p + "/Command.cmd");
        string current_dir = replace_string(p, "/Cases/", "/Currents/");
        recursively_create_dir(current_dir);
        command = string(PROJECT_DIR) + "/bin/l10ns --rootDir " + current_dir + " " + command;
        string result = execute_command(command);
        write_file(current_dir + "/Output.txt", result);
        string test_name = p.substr(p.find_last_of("/") + 1);
        test(test_name, [result, p](Test* t) {
            string reference_file = replace_string(p, "/Cases/", "/References/");
            string reference = read_file(reference_file + "/Output.txt");
            if (result != reference) {
                throw runtime_error("Assertion Error!");
            }
        });
    }
}

} // TestFramework
