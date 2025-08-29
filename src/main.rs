use std::{fmt, fs::File};

use protobuf::Message;
use scip::types::Index;

const TARGET: &str = "src/app/components/lender-qview-task-list-page/lender-qview-task-list-page/lender-qview-task-list-page.component.ts";
// "src/app/components/lib/lender-common-components/lender-search-toolbar-v2/lender-search-toolbar-v2.component.ts";

struct RangeDisplay<'a>(&'a [i32]);

impl<'a> fmt::Display for RangeDisplay<'a> {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        if self.0.len() < 2 {
            return write!(f, "∅");
        }
        let (start, end) = self.0.split_at(2);
        match (start, end) {
            ([line, char], []) => write!(f, "{}:{}", line + 1, char + 1),
            ([start_line, start_char], [end_char]) => {
                write!(f, "{}:{}-{}", start_line + 1, start_char + 1, end_char + 1)
            }
            ([start_line, start_char], [end_line, end_char]) => {
                write!(
                    f,
                    "{}:{},{}:{}",
                    start_line + 1,
                    start_char + 1,
                    end_line + 1,
                    end_char + 1
                )
            }
            _ => unreachable!(),
        }
    }
}

trait OccurrenceSymbolIsLDFlagSet {
    fn symbol_is_ldflagset(&self) -> bool;
}

impl OccurrenceSymbolIsLDFlagSet for scip::types::Occurrence {
    fn symbol_is_ldflagset(&self) -> bool {
        const SUFFIX1: &str = "'launchdarkly-js-client-sdk'`/LDFlagSet#";
        const SUFFIX2: &str = "'launchdarkly-js-sdk-common'`/LDFlagSet#";
        self.symbol.ends_with(SUFFIX1) || self.symbol.ends_with(SUFFIX2)
    }
}

fn main() {
    let index_path = std::env::args().nth(1).unwrap();

    let mut index_file = File::open(&index_path).unwrap();
    let index = Index::parse_from_reader(&mut index_file).unwrap();
    for doc in &index.documents {
        if doc.relative_path != TARGET {
            continue;
        }
        for o in &doc.occurrences {
            if o.symbol_is_ldflagset() {
                let range = RangeDisplay(&o.range);
                println!("{range} | {}", o.symbol);
            }
        }
    }
}
